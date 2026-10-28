import {
  PrismaClient,
  Role,
  ConsultationStatus,
  Prisma
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError
} from '../../common/errors/AppError';
import { AuthUser } from '../../middleware/auth.middleware';
import {
  GetConsultationsQuery,
  CreatePrescriptionInput
} from './consultations.validation';

export class ConsultationsService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Helper to verify if an authenticated user has access to a consultation,
   * returning the consultation if authorized or throwing NotFoundError / ForbiddenError.
   */
  private async getAuthorizedConsultation(consultationId: string, user: AuthUser) {
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          }
        },
        patient: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                avatarUrl: true
              }
            }
          }
        },
        slot: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true
          }
        },
        prescriptions: {
          select: {
            id: true,
            prescriptionNumber: true,
            diagnosis: true,
            issuedAt: true
          }
        }
      }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    if (user.role === Role.ADMIN) {
      return consultation;
    }

    if (user.role === Role.PATIENT) {
      if (consultation.patientId !== user.id) {
        throw new NotFoundError('Consultation not found');
      }
      return consultation;
    }

    if (user.role === Role.DOCTOR) {
      const doctorProfile = await this.db.doctor.findUnique({
        where: { userId: user.id }
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw new NotFoundError('Consultation not found');
      }
      return consultation;
    }

    throw new ForbiddenError('You do not have permission to access this consultation');
  }

  /**
   * Helper to verify that an authenticated user is either the assigned doctor or an ADMIN.
   */
  private async verifyDoctorOrAdminAccess(consultationId: string, user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role !== Role.DOCTOR) {
      throw new ForbiddenError('Only the assigned doctor or an administrator may perform this action');
    }

    const doctorProfile = await this.db.doctor.findUnique({
      where: { userId: user.id }
    });

    if (!doctorProfile) {
      throw new ForbiddenError('Doctor profile not found for this user account');
    }

    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId },
      select: { doctorId: true }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    if (consultation.doctorId !== doctorProfile.id) {
      throw new ForbiddenError('You are not authorized to manage consultations assigned to another doctor');
    }
  }

  /**
   * Retrieves paginated consultations based on user role (Patient sees own, Doctor sees assigned, Admin sees all).
   */
  async getConsultations(user: AuthUser, query: GetConsultationsQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ConsultationWhereInput = {};

    if (user.role === Role.PATIENT) {
      where.patientId = user.id;
    } else if (user.role === Role.DOCTOR) {
      const doctorProfile = await this.db.doctor.findUnique({
        where: { userId: user.id }
      });
      if (!doctorProfile) {
        return {
          consultations: [],
          meta: { page, limit, total: 0, totalPages: 0 }
        };
      }
      where.doctorId = doctorProfile.id;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [total, consultations] = await Promise.all([
      this.db.consultation.count({ where }),
      this.db.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          consultationNumber: true,
          patientId: true,
          doctorId: true,
          slotId: true,
          status: true,
          fee: true,
          symptomsSummary: true,
          notes: true,
          startedAt: true,
          endedAt: true,
          cancellationReason: true,
          createdAt: true,
          doctor: {
            select: {
              id: true,
              specialization: true,
              consultationFee: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  profile: {
                    select: {
                      firstName: true,
                      lastName: true,
                      avatarUrl: true
                    }
                  }
                }
              }
            }
          },
          patient: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  avatarUrl: true
                }
              }
            }
          },
          slot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true
            }
          },
          prescriptions: {
            select: {
              id: true,
              prescriptionNumber: true,
              diagnosis: true,
              issuedAt: true
            }
          }
        }
      })
    ]);

    return {
      consultations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves a single consultation by ID with role-based ownership verification.
   */
  async getConsultationById(consultationId: string, user: AuthUser) {
    return this.getAuthorizedConsultation(consultationId, user);
  }

  /**
   * Starts a consultation (transitions from SCHEDULED/REQUESTED to IN_PROGRESS).
   */
  async startConsultation(consultationId: string, user: AuthUser) {
    // 1. Verify access
    await this.verifyDoctorOrAdminAccess(consultationId, user);

    // 2. Inspect current consultation state
    const current = await this.db.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!current) {
      throw new NotFoundError('Consultation not found');
    }

    if (current.status === ConsultationStatus.IN_PROGRESS) {
      throw new BadRequestError('Consultation is already in progress');
    }

    if (current.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestError('Cannot start a consultation that is already completed');
    }

    if (current.status === ConsultationStatus.CANCELLED || current.status === ConsultationStatus.REJECTED) {
      throw new BadRequestError('Cannot start a cancelled or rejected consultation');
    }

    // 3. Atomically transition state to IN_PROGRESS
    const updateResult = await this.db.consultation.updateMany({
      where: {
        id: consultationId,
        status: { in: [ConsultationStatus.SCHEDULED, ConsultationStatus.REQUESTED] }
      },
      data: {
        status: ConsultationStatus.IN_PROGRESS,
        startedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      throw new BadRequestError('Consultation cannot be started from its current state');
    }

    // 4. Record audit event
    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CONSULTATION_STARTED',
        resourceType: 'CONSULTATION',
        resourceId: consultationId
      }
    });

    return this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            user: {
              select: {
                profile: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        },
        slot: true
      }
    });
  }

  /**
   * Completes a consultation (transitions from IN_PROGRESS to COMPLETED).
   */
  async completeConsultation(consultationId: string, user: AuthUser) {
    // 1. Verify access
    await this.verifyDoctorOrAdminAccess(consultationId, user);

    // 2. Inspect current consultation state
    const current = await this.db.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!current) {
      throw new NotFoundError('Consultation not found');
    }

    if (current.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestError('Consultation has already been completed');
    }

    if (current.status !== ConsultationStatus.IN_PROGRESS) {
      throw new BadRequestError('Only in-progress consultations can be completed');
    }

    // 3. Atomically transition state to COMPLETED
    const updateResult = await this.db.consultation.updateMany({
      where: {
        id: consultationId,
        status: ConsultationStatus.IN_PROGRESS
      },
      data: {
        status: ConsultationStatus.COMPLETED,
        endedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      throw new BadRequestError('Consultation cannot be completed from its current state');
    }

    // 4. Record audit event
    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CONSULTATION_COMPLETED',
        resourceType: 'CONSULTATION',
        resourceId: consultationId
      }
    });

    return this.db.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            user: {
              select: {
                profile: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        },
        slot: true
      }
    });
  }

  /**
   * Atomically issues a prescription with items for an in-progress or completed consultation.
   */
  async createPrescription(
    consultationId: string,
    input: CreatePrescriptionInput,
    user: AuthUser
  ) {
    // 1. Verify doctor or admin authorization
    await this.verifyDoctorOrAdminAccess(consultationId, user);

    // 2. Inspect consultation state
    const consultation = await this.db.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    if (
      consultation.status !== ConsultationStatus.IN_PROGRESS &&
      consultation.status !== ConsultationStatus.COMPLETED
    ) {
      throw new BadRequestError(
        'Prescriptions can only be issued for in-progress or completed consultations'
      );
    }

    // 3. Atomic transaction to create prescription and prescription items
    return this.db.$transaction(async (tx) => {
      // Prevent duplicate prescription creation
      const existingPrescription = await tx.prescription.findFirst({
        where: { consultationId }
      });

      if (existingPrescription) {
        throw new ConflictError(
          'A prescription has already been issued for this consultation'
        );
      }

      // Generate unique prescription number
      const prescriptionNumber = `RX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Create prescription with nested items
      const prescription = await tx.prescription.create({
        data: {
          prescriptionNumber,
          consultationId,
          diagnosis: input.diagnosis,
          instructions: input.instructions,
          items: {
            create: input.items.map((item) => ({
              medicineName: item.medicineName,
              dosage: item.dosage,
              frequency: item.frequency,
              durationDays: item.durationDays,
              instructions: item.instructions
            }))
          }
        },
        include: {
          items: true
        }
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'PRESCRIPTION_ISSUED',
          resourceType: 'PRESCRIPTION',
          resourceId: prescription.id,
          metadata: {
            consultationId,
            prescriptionNumber,
            itemCount: input.items.length
          }
        }
      });

      return prescription;
    });
  }

  /**
   * Retrieves the prescription for a consultation with role-based access verification.
   */
  async getPrescription(consultationId: string, user: AuthUser) {
    // Verify user has access to view this consultation
    await this.getAuthorizedConsultation(consultationId, user);

    const prescription = await this.db.prescription.findFirst({
      where: { consultationId },
      include: {
        items: true
      }
    });

    if (!prescription) {
      throw new NotFoundError('No prescription has been issued for this consultation');
    }

    return prescription;
  }
}

export const consultationsService = new ConsultationsService();
