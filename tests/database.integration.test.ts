import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ConsultationStatus, SlotStatus, DoctorStatus, Role } from '@prisma/client';

// Single PrismaClient instance for the integration test suite
const prisma = new PrismaClient({
  log: []
});

let isDatabaseAvailable = false;

// Registry tracking created test record IDs for safe, isolated teardown
interface TestEntityRegistry {
  consultationIds: Set<string>;
  slotIds: Set<string>;
  doctorIds: Set<string>;
  idempotencyIds: Set<string>;
  userIds: Set<string>;
}

const track: TestEntityRegistry = {
  consultationIds: new Set<string>(),
  slotIds: new Set<string>(),
  doctorIds: new Set<string>(),
  idempotencyIds: new Set<string>(),
  userIds: new Set<string>()
};

beforeAll(async () => {
  let timer: NodeJS.Timeout | undefined;

  try {
    // Single bounded probe promise with managed timer to prevent leaked handles
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PostgreSQL connection probe timeout')), 2000);
      })
    ]);
    isDatabaseAvailable = true;
  } catch {
    isDatabaseAvailable = false;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
});

afterAll(async () => {
  try {
    if (isDatabaseAvailable) {
      // 1. Delete consultations first (foreign key dependents of slots, doctors, and users)
      const consultationIds = Array.from(track.consultationIds);
      if (consultationIds.length > 0) {
        await prisma.consultation.deleteMany({
          where: { id: { in: consultationIds } }
        });
      }

      // 2. Delete availability slots (foreign key dependents of doctors)
      const slotIds = Array.from(track.slotIds);
      if (slotIds.length > 0) {
        await prisma.availabilitySlot.deleteMany({
          where: { id: { in: slotIds } }
        });
      }

      // 3. Delete doctor profiles (foreign key dependents of users)
      const doctorIds = Array.from(track.doctorIds);
      if (doctorIds.length > 0) {
        await prisma.doctor.deleteMany({
          where: { id: { in: doctorIds } }
        });
      }

      // 4. Delete idempotency records (foreign key dependents of users)
      const idempotencyIds = Array.from(track.idempotencyIds);
      if (idempotencyIds.length > 0) {
        await prisma.idempotencyRecord.deleteMany({
          where: { id: { in: idempotencyIds } }
        });
      }

      // 5. Delete user accounts (root entities)
      const userIds = Array.from(track.userIds);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: userIds } }
        });
      }
    }
  } finally {
    // Disconnect PrismaClient in finally block - guaranteed to execute after cleanup attempts
    await prisma.$disconnect();
  }
});

describe('PostgreSQL Live Database Integration Tests', () => {
  it('checks and honestly reports PostgreSQL server availability', () => {
    if (!isDatabaseAvailable) {
      console.warn(
        '⚠️ PostgreSQL server is currently offline or unreachable on localhost:5432.\n' +
        '   Live database integration tests are skipped as per test requirements.\n' +
        '   To run live database integration tests, start PostgreSQL via `docker compose up -d postgres` and apply `npm run prisma:migrate`.'
      );
    }
    expect(typeof isDatabaseAvailable).toBe('boolean');
  });

  describe('Engine-Enforced Database Constraints (Live PostgreSQL Only)', () => {
    it('should reject duplicate user email at the database constraint level', async ({ skip }) => {
      if (!isDatabaseAvailable) {
        skip();
        return;
      }

      const timestamp = Date.now();
      const testEmail = `user_dup_${timestamp}@example.com`;

      const user1 = await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890'
        }
      });
      track.userIds.add(user1.id);

      // Duplicate email insertion must be rejected by PostgreSQL unique constraint
      await expect(
        prisma.user.create({
          data: {
            email: testEmail,
            passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890'
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce idempotency compound uniqueness on [userId, key]', async ({ skip }) => {
      if (!isDatabaseAvailable) {
        skip();
        return;
      }

      const timestamp = Date.now();
      const user = await prisma.user.create({
        data: {
          email: `idemp_user_${timestamp}@example.com`,
          passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890'
        }
      });
      track.userIds.add(user.id);

      const key = `idemp_key_${timestamp}`;
      const record1 = await prisma.idempotencyRecord.create({
        data: {
          userId: user.id,
          key,
          requestPath: '/api/v1/bookings',
          requestMethod: 'POST',
          requestHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          expiresAt: new Date(Date.now() + 300000)
        }
      });
      track.idempotencyIds.add(record1.id);

      // Duplicate compound [userId, key] insertion must be rejected
      await expect(
        prisma.idempotencyRecord.create({
          data: {
            userId: user.id,
            key,
            requestPath: '/api/v1/bookings',
            requestMethod: 'POST',
            requestHash: 'differenthash1234567890123456789012345678901234567890123456789012',
            expiresAt: new Date(Date.now() + 300000)
          }
        })
      ).rejects.toThrow();
    });

    it('should prevent two active consultations on the same slot and allow re-booking once cancelled', async ({ skip }) => {
      if (!isDatabaseAvailable) {
        skip();
        return;
      }

      const timestamp = Date.now();

      // Create isolated patient
      const patient = await prisma.user.create({
        data: {
          email: `patient_slot_${timestamp}@example.com`,
          passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890',
          role: Role.PATIENT
        }
      });
      track.userIds.add(patient.id);

      // Create isolated doctor
      const doctorUser = await prisma.user.create({
        data: {
          email: `doc_slot_${timestamp}@example.com`,
          passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890',
          role: Role.DOCTOR
        }
      });
      track.userIds.add(doctorUser.id);

      const doctor = await prisma.doctor.create({
        data: {
          userId: doctorUser.id,
          licenseNumber: `LIC_SLOT_${timestamp}`,
          specialization: 'Ayurvedic Medicine',
          consultationFee: 750.00,
          status: DoctorStatus.VERIFIED
        }
      });
      track.doctorIds.add(doctor.id);

      // Create availability slot
      const startTime = new Date(timestamp + 86400000);
      const endTime = new Date(timestamp + 86400000 + 2700000); // 45 min
      const slot = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctor.id,
          startTime,
          endTime,
          status: SlotStatus.BOOKED
        }
      });
      track.slotIds.add(slot.id);

      // 1. First active consultation succeeds
      const consultation1 = await prisma.consultation.create({
        data: {
          consultationNumber: `CON_${timestamp}_A`,
          patientId: patient.id,
          doctorId: doctor.id,
          slotId: slot.id,
          status: ConsultationStatus.SCHEDULED,
          fee: 750.00
        }
      });
      track.consultationIds.add(consultation1.id);

      // 2. Second active consultation for the same slot must fail via partial unique index
      await expect(
        prisma.consultation.create({
          data: {
            consultationNumber: `CON_${timestamp}_B`,
            patientId: patient.id,
            doctorId: doctor.id,
            slotId: slot.id,
            status: ConsultationStatus.REQUESTED,
            fee: 750.00
          }
        })
      ).rejects.toThrow();

      // 3. Mark first consultation as CANCELLED
      await prisma.consultation.update({
        where: { id: consultation1.id },
        data: {
          status: ConsultationStatus.CANCELLED,
          cancellationReason: 'Patient rescheduled'
        }
      });

      // 4. Now a new active consultation for the same slot must succeed
      const consultation2 = await prisma.consultation.create({
        data: {
          consultationNumber: `CON_${timestamp}_C`,
          patientId: patient.id,
          doctorId: doctor.id,
          slotId: slot.id,
          status: ConsultationStatus.SCHEDULED,
          fee: 750.00
        }
      });
      track.consultationIds.add(consultation2.id);

      expect(consultation2.id).toBeDefined();
    });

    it('should reject overlapping doctor slots via exclusion constraint but allow contiguous slots', async ({ skip }) => {
      if (!isDatabaseAvailable) {
        skip();
        return;
      }

      const timestamp = Date.now();
      const doctorUser = await prisma.user.create({
        data: {
          email: `doc_excl_${timestamp}@example.com`,
          passwordHash: '$2b$10$dummyhashforuniquenesstest12345678901234567890',
          role: Role.DOCTOR
        }
      });
      track.userIds.add(doctorUser.id);

      const doctor = await prisma.doctor.create({
        data: {
          userId: doctorUser.id,
          licenseNumber: `LIC_EXCL_${timestamp}`,
          specialization: 'Ayurvedic Medicine',
          consultationFee: 500.00,
          status: DoctorStatus.VERIFIED
        }
      });
      track.doctorIds.add(doctor.id);

      // Slot 1: 10:00 to 10:45
      const slot1Start = new Date('2026-12-01T10:00:00.000Z');
      const slot1End = new Date('2026-12-01T10:45:00.000Z');
      const slot1 = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctor.id,
          startTime: slot1Start,
          endTime: slot1End,
          status: SlotStatus.AVAILABLE
        }
      });
      track.slotIds.add(slot1.id);

      // Overlapping Slot (10:30 to 11:15) must be rejected by PostgreSQL exclusion constraint
      const overlapStart = new Date('2026-12-01T10:30:00.000Z');
      const overlapEnd = new Date('2026-12-01T11:15:00.000Z');
      await expect(
        prisma.availabilitySlot.create({
          data: {
            doctorId: doctor.id,
            startTime: overlapStart,
            endTime: overlapEnd,
            status: SlotStatus.AVAILABLE
          }
        })
      ).rejects.toThrow();

      // Contiguous Slot (10:45 to 11:30) with half-open interval '[)' must succeed
      const contiguousStart = new Date('2026-12-01T10:45:00.000Z');
      const contiguousEnd = new Date('2026-12-01T11:30:00.000Z');
      const slot2 = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctor.id,
          startTime: contiguousStart,
          endTime: contiguousEnd,
          status: SlotStatus.AVAILABLE
        }
      });
      track.slotIds.add(slot2.id);

      expect(slot2.id).toBeDefined();
    });
  });
});
