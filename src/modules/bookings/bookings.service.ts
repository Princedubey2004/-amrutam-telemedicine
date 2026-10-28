import crypto from 'crypto';
import {
  PrismaClient,
  Role,
  DoctorStatus,
  SlotStatus,
  ConsultationStatus,
  IdempotencyStatus,
  Prisma
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError
} from '../../common/errors/AppError';
import { AuthUser } from '../../middleware/auth.middleware';
import {
  CreateBookingInput,
  GetBookingsQuery,
  CancelBookingInput
} from './bookings.validation';

export interface BookingResponseWithReplay {
  isReplay: boolean;
  statusCode: number;
  data: unknown;
}

export class BookingsService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Atomically creates a consultation booking and reserves the availability slot.
   * Supports deterministic request hashing, optimistic concurrency control, and Idempotency-Key.
   */
  async createBooking(
    patientId: string,
    input: CreateBookingInput,
    idempotencyKey?: string
  ): Promise<BookingResponseWithReplay> {
    let requestHash = '';

    // 1. Validate and handle Idempotency-Key header if supplied
    if (idempotencyKey) {
      if (!/^[a-zA-Z0-9_-]{1,255}$/.test(idempotencyKey)) {
        throw new BadRequestError(
          'Invalid Idempotency-Key format. Must be an alphanumeric string or UUID between 1 and 255 characters.'
        );
      }

      // Compute deterministic hash of the request payload
      const normalizedPayload = JSON.stringify({
        slotId: input.slotId,
        symptomsSummary: input.symptomsSummary || null,
        notes: input.notes || null
      });
      requestHash = crypto.createHash('sha256').update(normalizedPayload).digest('hex');

      // Check existing idempotency record
      const existingRecord = await this.db.idempotencyRecord.findUnique({
        where: { userId_key: { userId: patientId, key: idempotencyKey } }
      });

      if (existingRecord && existingRecord.expiresAt > new Date()) {
        if (existingRecord.requestHash !== requestHash) {
          throw new UnprocessableEntityError(
            'Idempotency key has already been used with a different request payload'
          );
        }

        if (existingRecord.status === IdempotencyStatus.COMPLETED) {
          return {
            isReplay: true,
            statusCode: existingRecord.statusCode ?? 201,
            data: existingRecord.responseBody
          };
        }

        if (existingRecord.status === IdempotencyStatus.PENDING) {
          throw new ConflictError(
            'A booking request with this idempotency key is currently being processed'
          );
        }
      }

      // Register or update idempotency record as PENDING
      try {
        await this.db.idempotencyRecord.upsert({
          where: { userId_key: { userId: patientId, key: idempotencyKey } },
          update: {
            status: IdempotencyStatus.PENDING,
            requestHash,
            requestPath: '/api/v1/bookings',
            requestMethod: 'POST',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          },
          create: {
            userId: patientId,
            key: idempotencyKey,
            requestPath: '/api/v1/bookings',
            requestMethod: 'POST',
            requestHash,
            status: IdempotencyStatus.PENDING,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const record = await this.db.idempotencyRecord.findUnique({
            where: { userId_key: { userId: patientId, key: idempotencyKey } }
          });
          if (record && record.requestHash !== requestHash) {
            throw new UnprocessableEntityError(
              'Idempotency key has already been used with a different request payload'
            );
          }
          if (record && record.status === IdempotencyStatus.COMPLETED) {
            return {
              isReplay: true,
              statusCode: record.statusCode ?? 201,
              data: record.responseBody
            };
          }
          throw new ConflictError(
            'A booking request with this idempotency key is currently being processed'
          );
        }
        throw err;
      }
    }

    // 2. Perform atomic booking transaction
    try {
      const createdConsultation = await this.db.$transaction(async (tx) => {
        // Find availability slot with associated doctor and user
        const slot = await tx.availabilitySlot.findUnique({
          where: { id: input.slotId },
          include: {
            doctor: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    isActive: true,
                    profile: {
                      select: {
                        firstName: true,
                        lastName: true,
                        phoneNumber: true,
                        avatarUrl: true
                      }
                    }
                  }
                }
              }
            }
          }
        });

        if (!slot) {
          throw new NotFoundError('Availability slot not found');
        }

        if (slot.status !== SlotStatus.AVAILABLE) {
          throw new BadRequestError('The requested availability slot is not available for booking');
        }

        if (slot.startTime <= new Date()) {
          throw new BadRequestError('Cannot book an availability slot in the past');
        }

        if (slot.doctor.status !== DoctorStatus.VERIFIED || !slot.doctor.user.isActive) {
          throw new BadRequestError('The requested doctor is not currently active or verified');
        }

        // Optimistic concurrency check: atomically update slot status from AVAILABLE to BOOKED
        const updateSlotResult = await tx.availabilitySlot.updateMany({
          where: {
            id: slot.id,
            status: SlotStatus.AVAILABLE,
            version: slot.version
          },
          data: {
            status: SlotStatus.BOOKED,
            version: { increment: 1 }
          }
        });

        if (updateSlotResult.count === 0) {
          throw new ConflictError(
            'The requested availability slot was just booked by another user'
          );
        }

        // Generate unique consultation reference number
        const consultationNumber = `AMR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Create consultation with database doctor fee (client fee is strictly ignored)
        const consultation = await tx.consultation.create({
          data: {
            consultationNumber,
            patientId,
            doctorId: slot.doctorId,
            slotId: slot.id,
            status: ConsultationStatus.SCHEDULED,
            fee: slot.doctor.consultationFee,
            symptomsSummary: input.symptomsSummary,
            notes: input.notes
          },
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
            slot: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                status: true
              }
            }
          }
        });

        // Record audit event
        await tx.auditLog.create({
          data: {
            actorId: patientId,
            action: 'APPOINTMENT_BOOKED',
            resourceType: 'CONSULTATION',
            resourceId: consultation.id,
            metadata: {
              slotId: slot.id,
              doctorId: slot.doctorId,
              consultationNumber,
              fee: slot.doctor.consultationFee.toString()
            }
          }
        });

        // Complete idempotency record inside transaction to guarantee atomic commit
        if (idempotencyKey) {
          await tx.idempotencyRecord.upsert({
            where: { userId_key: { userId: patientId, key: idempotencyKey } },
            update: {
              status: IdempotencyStatus.COMPLETED,
              statusCode: 201,
              responseBody: consultation as never,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            },
            create: {
              userId: patientId,
              key: idempotencyKey,
              requestPath: '/api/v1/bookings',
              requestMethod: 'POST',
              requestHash,
              status: IdempotencyStatus.COMPLETED,
              statusCode: 201,
              responseBody: consultation as never,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          });
        }

        return consultation;
      });

      return {
        isReplay: false,
        statusCode: 201,
        data: createdConsultation
      };
    } catch (error) {
      // Revert PENDING idempotency status on failure so client may safely retry
      if (idempotencyKey) {
        await this.db.idempotencyRecord
          .updateMany({
            where: {
              userId: patientId,
              key: idempotencyKey,
              status: IdempotencyStatus.PENDING
            },
            data: { status: IdempotencyStatus.FAILED }
          })
          .catch(() => {});
      }

      // Convert PostgreSQL partial unique index conflict to safe HTTP 409
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('This availability slot has already been booked');
      }

      throw error;
    }
  }

  /**
   * Retrieves paginated bookings strictly scoped to the authenticated patient.
   */
  async getMyBookings(patientId: string, query: GetBookingsQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.ConsultationWhereInput = {
      patientId
    };

    if (query.status) {
      where.status = query.status;
    }

    const [total, bookings] = await Promise.all([
      this.db.consultation.count({ where }),
      this.db.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { slot: { startTime: 'desc' } },
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
          slot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true
            }
          }
        }
      })
    ]);

    return {
      bookings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves a single booking by ID with ownership verification.
   */
  async getBookingById(bookingId: string, user: AuthUser) {
    const booking = await this.db.consultation.findUnique({
      where: { id: bookingId },
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
        cancellationReason: true,
        createdAt: true,
        updatedAt: true,
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
                    phoneNumber: true,
                    avatarUrl: true
                  }
                }
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
        }
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Enforce ownership: only the owning patient or an ADMIN may view booking details
    if (user.role !== Role.ADMIN && booking.patientId !== user.id) {
      throw new NotFoundError('Booking not found');
    }

    return booking;
  }

  /**
   * Atomically cancels an active consultation and conditionally restores slot availability.
   * Past slots or slots already cancelled by a doctor are never restored.
   */
  async cancelBooking(bookingId: string, input: CancelBookingInput, user: AuthUser) {
    const booking = await this.db.consultation.findUnique({
      where: { id: bookingId },
      include: {
        slot: true
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Ownership check
    if (user.role !== Role.ADMIN && booking.patientId !== user.id) {
      throw new NotFoundError('Booking not found');
    }

    // State validation
    if (booking.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestError('Cannot cancel a completed consultation');
    }

    if (booking.status === ConsultationStatus.CANCELLED) {
      throw new BadRequestError('Consultation has already been cancelled');
    }

    if (booking.status === ConsultationStatus.IN_PROGRESS) {
      throw new BadRequestError('Cannot cancel a consultation currently in progress');
    }

    if (booking.status === ConsultationStatus.REJECTED) {
      throw new BadRequestError('Cannot cancel a rejected consultation');
    }

    const reason = input.reason || 'Cancelled by user';
    const now = new Date();

    return this.db.$transaction(async (tx) => {
      // Optimistic concurrency check: atomically update consultation
      const updateResult = await tx.consultation.updateMany({
        where: {
          id: bookingId,
          status: {
            notIn: [
              ConsultationStatus.COMPLETED,
              ConsultationStatus.CANCELLED,
              ConsultationStatus.IN_PROGRESS,
              ConsultationStatus.REJECTED
            ]
          }
        },
        data: {
          status: ConsultationStatus.CANCELLED,
          cancellationReason: reason
        }
      });

      if (updateResult.count === 0) {
        throw new BadRequestError('Consultation is no longer in a cancellable state');
      }

      // Domain rule: Only restore slot to AVAILABLE if it is in the future AND currently BOOKED.
      // Past slots must NEVER be reopened. Cancelled slots must remain CANCELLED.
      let slotRestored = false;
      if (booking.slot.startTime > now && booking.slot.status === SlotStatus.BOOKED) {
        await tx.availabilitySlot.update({
          where: { id: booking.slotId },
          data: {
            status: SlotStatus.AVAILABLE,
            version: { increment: 1 }
          }
        });
        slotRestored = true;
      }

      // Audit log entry
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'APPOINTMENT_CANCELLED',
          resourceType: 'CONSULTATION',
          resourceId: booking.id,
          metadata: {
            slotId: booking.slotId,
            reason,
            slotRestored
          }
        }
      });

      return tx.consultation.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          consultationNumber: true,
          patientId: true,
          doctorId: true,
          slotId: true,
          status: true,
          cancellationReason: true,
          updatedAt: true,
          slot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true
            }
          }
        }
      });
    });
  }
}

export const bookingsService = new BookingsService();
