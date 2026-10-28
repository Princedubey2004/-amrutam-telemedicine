import { PrismaClient, SlotStatus, DoctorStatus, Role, ConsultationStatus, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '../../common/errors/AppError';
import { AuthUser } from '../../middleware/auth.middleware';
import { CreateSlotInput, GetAvailabilityQuery } from './availability.validation';

export class AvailabilityService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Enforces server-side authorization: only the doctor owning the profile or an ADMIN can manage availability.
   */
  async verifyDoctorManagementAccess(doctorId: string, user: AuthUser): Promise<void> {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role === Role.DOCTOR) {
      const doctorProfile = await this.db.doctor.findUnique({
        where: { userId: user.id }
      });

      if (!doctorProfile || doctorProfile.id !== doctorId) {
        throw new ForbiddenError('You do not have permission to manage availability for this doctor profile');
      }
      return;
    }

    throw new ForbiddenError('You do not have permission to manage doctor availability');
  }

  /**
   * Creates an availability slot for a doctor with overlap and validity checks.
   */
  async createSlot(doctorId: string, input: CreateSlotInput, user: AuthUser) {
    // 1. Verify doctor exists
    const doctor = await this.db.doctor.findUnique({
      where: { id: doctorId }
    });

    if (!doctor) {
      throw new NotFoundError('Doctor profile not found');
    }

    // 2. Enforce authorization
    await this.verifyDoctorManagementAccess(doctorId, user);

    // 3. Application-level check for overlapping non-cancelled slots
    const overlappingSlot = await this.db.availabilitySlot.findFirst({
      where: {
        doctorId,
        status: { not: SlotStatus.CANCELLED },
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime }
      }
    });

    if (overlappingSlot) {
      throw new ConflictError('An availability slot already exists that overlaps with this time range');
    }

    // 4. Create availability slot with database constraint safety
    try {
      return await this.db.availabilitySlot.create({
        data: {
          doctorId,
          startTime: input.startTime,
          endTime: input.endTime,
          status: SlotStatus.AVAILABLE
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('An availability slot already exists that overlaps with this time range');
      }
      throw error;
    }
  }

  /**
   * Retrieves available future slots for a doctor with optional date range filtering.
   */
  async getPublicDoctorAvailability(doctorId: string, query: GetAvailabilityQuery) {
    // 1. Verify doctor exists and is verified
    const doctor = await this.db.doctor.findFirst({
      where: {
        id: doctorId,
        status: DoctorStatus.VERIFIED,
        user: { isActive: true }
      }
    });

    if (!doctor) {
      throw new NotFoundError('Doctor not found or profile is not publicly active');
    }

    // 2. Build where filter for available future slots only
    const now = new Date();
    const where: Prisma.AvailabilitySlotWhereInput = {
      doctorId,
      status: SlotStatus.AVAILABLE,
      startTime: { gt: now }
    };

    if (query.startDate) {
      const effectiveStart = query.startDate > now ? query.startDate : now;
      where.startTime = { gt: effectiveStart };
    }

    if (query.endDate) {
      where.endTime = { lte: query.endDate };
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [total, slots] = await Promise.all([
      this.db.availabilitySlot.count({ where }),
      this.db.availabilitySlot.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          doctorId: true,
          startTime: true,
          endTime: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    return {
      slots,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Safely cancels/removes a doctor availability slot preserving auditability.
   */
  async cancelSlot(doctorId: string, slotId: string, user: AuthUser) {
    // 1. Enforce authorization
    await this.verifyDoctorManagementAccess(doctorId, user);

    // 2. Verify slot exists for this doctor
    const slot = await this.db.availabilitySlot.findFirst({
      where: { id: slotId, doctorId }
    });

    if (!slot) {
      throw new NotFoundError('Availability slot not found');
    }

    // 3. Check if already cancelled
    if (slot.status === SlotStatus.CANCELLED) {
      throw new BadRequestError('Availability slot is already cancelled');
    }

    // 4. Ensure no active/booked consultations exist for this slot
    const activeConsultation = await this.db.consultation.findFirst({
      where: {
        slotId,
        status: {
          notIn: [ConsultationStatus.CANCELLED, ConsultationStatus.REJECTED]
        }
      }
    });

    if (activeConsultation || slot.status === SlotStatus.BOOKED) {
      throw new BadRequestError('Cannot cancel slot because an active consultation is booked for this time');
    }

    // 5. Update slot status to CANCELLED (status-based cancellation preserving audit trail)
    return this.db.availabilitySlot.update({
      where: { id: slotId },
      data: {
        status: SlotStatus.CANCELLED,
        version: { increment: 1 }
      }
    });
  }
}

export const availabilityService = new AvailabilityService();
