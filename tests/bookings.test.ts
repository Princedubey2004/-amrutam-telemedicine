import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import {
  Role,
  DoctorStatus,
  SlotStatus,
  ConsultationStatus,
  IdempotencyStatus,
  Prisma
} from '@prisma/client';

describe('Appointment Booking Module Unit & API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createAuthToken = (userId: string, role: Role, email: string) => {
    return jwt.sign({ sub: userId, role, email }, env.JWT_SECRET, { expiresIn: '1h' });
  };

  const patientId = 'b0000000-0000-0000-0000-000000000002';
  const otherPatientId = 'e0000000-0000-0000-0000-000000000005';
  const doctorUserId = 'c0000000-0000-0000-0000-000000000003';
  const adminUserId = 'a0000000-0000-0000-0000-000000000001';

  const patientToken = createAuthToken(patientId, Role.PATIENT, 'patient@example.com');
  const otherPatientToken = createAuthToken(otherPatientId, Role.PATIENT, 'other.patient@example.com');
  const doctorToken = createAuthToken(doctorUserId, Role.DOCTOR, 'doctor@example.com');
  const adminToken = createAuthToken(adminUserId, Role.ADMIN, 'admin@example.com');

  const doctorId = '11111111-1111-1111-1111-111111111111';
  const slotId = '33333333-3333-3333-3333-333333333333';
  const bookingId = '44444444-4444-4444-4444-444444444444';

  const futureSlotStart = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 hours
  const futureSlotEnd = new Date(futureSlotStart.getTime() + 45 * 60 * 1000); // +45 minutes

  const mockAvailableSlot = {
    id: slotId,
    doctorId,
    startTime: futureSlotStart,
    endTime: futureSlotEnd,
    status: SlotStatus.AVAILABLE,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    doctor: {
      id: doctorId,
      status: DoctorStatus.VERIFIED,
      specialization: 'Ayurveda',
      consultationFee: '850.00',
      user: {
        id: doctorUserId,
        email: 'doctor@example.com',
        isActive: true,
        profile: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          phoneNumber: '+919876543210',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      }
    }
  };

  const mockConsultation = {
    id: bookingId,
    consultationNumber: 'AMR-1730100000000-ABCDEF',
    patientId,
    doctorId,
    slotId,
    status: ConsultationStatus.SCHEDULED,
    fee: '850.00',
    symptomsSummary: 'Severe migraine for 3 days',
    notes: 'Prefers herbal recommendations',
    cancellationReason: null,
    createdAt: new Date(),
    doctor: {
      id: doctorId,
      specialization: 'Ayurveda',
      consultationFee: '850.00',
      user: {
        id: doctorUserId,
        email: 'doctor@example.com',
        profile: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      }
    },
    slot: {
      id: slotId,
      startTime: futureSlotStart,
      endTime: futureSlotEnd,
      status: SlotStatus.BOOKED
    }
  };

  // Helper to mock Prisma $transaction
  const mockTransactionExecution = (callbackResult: unknown) => {
    vi.spyOn(prisma, '$transaction').mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return callbackResult;
    });
  };

  // -------------------------------------------------------------
  // 1. CREATE BOOKING TESTS
  // -------------------------------------------------------------

  describe('POST /api/v1/bookings', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ slotId });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('token is missing');
    });

    it('should reject non-patient users (DOCTOR) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ slotId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject non-patient users (ADMIN) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slotId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid slot ID format with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId: 'not-a-valid-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should return 404 Not Found when availability slot does not exist', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Availability slot not found');
    });

    it('should reject booking a slot that is already BOOKED with 400 Bad Request', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue({
        ...mockAvailableSlot,
        status: SlotStatus.BOOKED
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not available for booking');
    });

    it('should reject booking a past availability slot with 400 Bad Request', async () => {
      mockTransactionExecution(null);
      const pastStart = new Date(Date.now() - 3600000);
      const pastEnd = new Date(pastStart.getTime() + 1800000);

      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue({
        ...mockAvailableSlot,
        startTime: pastStart,
        endTime: pastEnd
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot book an availability slot in the past');
    });

    it('should reject booking if the doctor is not verified with 400 Bad Request', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue({
        ...mockAvailableSlot,
        doctor: {
          ...mockAvailableSlot.doctor,
          status: DoctorStatus.PENDING_VERIFICATION
        }
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not currently active or verified');
    });

    it('should successfully book an appointment atomically and return 201 Created', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue(mockAvailableSlot as never);
      vi.spyOn(prisma.availabilitySlot, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.consultation, 'create').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          slotId,
          symptomsSummary: 'Severe migraine for 3 days',
          notes: 'Prefers herbal recommendations'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Appointment booked successfully');
      expect(res.body.data.id).toBe(bookingId);
      expect(res.body.data.fee).toBe('850.00'); // Verified from DB doctor fee, not client input
      expect(res.body.data.status).toBe(ConsultationStatus.SCHEDULED);
    });

    it('should return 409 Conflict when concurrent booking fails optimistic concurrency version check', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue(mockAvailableSlot as never);
      // updateMany returns count: 0 simulating concurrent slot booking race condition
      vi.spyOn(prisma.availabilitySlot, 'updateMany').mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('booked by another user');
    });

    it('should return 409 Conflict when PostgreSQL unique index violation P2002 occurs', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.availabilitySlot, 'findUnique').mockResolvedValue(mockAvailableSlot as never);
      vi.spyOn(prisma.availabilitySlot, 'updateMany').mockResolvedValue({ count: 1 });

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.10.0'
      });
      vi.spyOn(prisma.consultation, 'create').mockRejectedValue(p2002Error);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been booked');
    });
  });

  // -------------------------------------------------------------
  // 2. IDEMPOTENCY-KEY TESTS
  // -------------------------------------------------------------

  describe('Idempotency-Key Header Handling', () => {
    const validIdempotencyKey = 'amrutam-req-uuid-987654321';

    it('should reject invalid Idempotency-Key format with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'invalid key with spaces!@#$%^')
        .send({ slotId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid Idempotency-Key format');
    });

    it('should replay the original successful response when repeated with same key and same payload', async () => {
      const crypto = await import('crypto');
      const normalizedPayload = JSON.stringify({
        slotId,
        symptomsSummary: null,
        notes: null
      });
      const requestHash = crypto.createHash('sha256').update(normalizedPayload).digest('hex');

      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        id: 'idem-1',
        userId: patientId,
        key: validIdempotencyKey,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash,
        status: IdempotencyStatus.COMPLETED,
        statusCode: 201,
        responseBody: mockConsultation,
        expiresAt: new Date(Date.now() + 86400000)
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ slotId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.header['x-idempotent-replay']).toBe('true');
      expect(res.body.data.id).toBe(bookingId);
    });

    it('should reject repeated request with same key and DIFFERENT payload with 422 Unprocessable Entity', async () => {
      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        id: 'idem-1',
        userId: patientId,
        key: validIdempotencyKey,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash: 'different-hash-from-previous-payload-12345',
        status: IdempotencyStatus.COMPLETED,
        statusCode: 201,
        responseBody: mockConsultation,
        expiresAt: new Date(Date.now() + 86400000)
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ slotId });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('different request payload');
    });

    it('should reject concurrent request with same key in PENDING status with 409 Conflict', async () => {
      const crypto = await import('crypto');
      const normalizedPayload = JSON.stringify({
        slotId,
        symptomsSummary: null,
        notes: null
      });
      const requestHash = crypto.createHash('sha256').update(normalizedPayload).digest('hex');

      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        id: 'idem-1',
        userId: patientId,
        key: validIdempotencyKey,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash,
        status: IdempotencyStatus.PENDING,
        statusCode: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + 86400000)
      } as never);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ slotId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('currently being processed');
    });
  });

  // -------------------------------------------------------------
  // 3. GET MY BOOKINGS TESTS
  // -------------------------------------------------------------

  describe('GET /api/v1/bookings', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/bookings');
      expect(res.status).toBe(401);
    });

    it('should reject non-patient users (DOCTOR) with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
    });

    it('should return paginated bookings for authenticated patient', async () => {
      vi.spyOn(prisma.consultation, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.consultation, 'findMany').mockResolvedValue([mockConsultation] as never);

      const res = await request(app)
        .get('/api/v1/bookings?page=1&limit=10&status=SCHEDULED')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(bookingId);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1
      });
    });
  });

  // -------------------------------------------------------------
  // 4. GET BOOKING BY ID TESTS
  // -------------------------------------------------------------

  describe('GET /api/v1/bookings/:id', () => {
    it('should return 404 when booking does not exist', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Booking not found');
    });

    it('should return 404 when a patient tries to access another patient booking', async () => {
      // Mock consultation belonging to patientId, requested by otherPatientId
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Booking not found');
    });

    it('should return 200 OK when owning patient accesses their booking', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(bookingId);
    });

    it('should return 200 OK when ADMIN accesses any patient booking', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(bookingId);
    });
  });

  // -------------------------------------------------------------
  // 5. CANCEL BOOKING TESTS
  // -------------------------------------------------------------

  describe('POST /api/v1/bookings/:id/cancel', () => {
    it('should return 404 when booking does not exist', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Personal conflict' });

      expect(res.status).toBe(404);
    });

    it('should return 404 when patient attempts to cancel another patient booking', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        slot: mockAvailableSlot
      } as never);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${otherPatientToken}`)
        .send({ reason: 'Unauthorized cancellation' });

      expect(res.status).toBe(404);
    });

    it('should reject cancelling a COMPLETED booking with 400 Bad Request', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.COMPLETED,
        slot: mockAvailableSlot
      } as never);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Too late' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('completed consultation');
    });

    it('should reject repeated cancellation of already CANCELLED booking with 400', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.CANCELLED,
        slot: mockAvailableSlot
      } as never);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Already cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been cancelled');
    });

    it('should successfully cancel booking and restore slot availability atomically', async () => {
      mockTransactionExecution(null);

      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({
          ...mockConsultation,
          status: ConsultationStatus.SCHEDULED,
          slot: {
            ...mockAvailableSlot,
            status: SlotStatus.BOOKED
          }
        } as never)
        .mockResolvedValueOnce({
          ...mockConsultation,
          status: ConsultationStatus.CANCELLED,
          cancellationReason: 'Need to reschedule',
          slot: {
            ...mockAvailableSlot,
            status: SlotStatus.AVAILABLE
          }
        } as never);

      vi.spyOn(prisma.consultation, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.availabilitySlot, 'update').mockResolvedValue({
        ...mockAvailableSlot,
        status: SlotStatus.AVAILABLE
      } as never);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-cancel' } as never);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Need to reschedule' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Appointment cancelled successfully');
      expect(res.body.data.status).toBe(ConsultationStatus.CANCELLED);
    });

    it('should not restore past slots to AVAILABLE upon cancellation', async () => {
      mockTransactionExecution(null);
      const pastStart = new Date(Date.now() - 3600000); // 1 hour ago
      const pastEnd = new Date(pastStart.getTime() + 1800000);

      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({
          ...mockConsultation,
          status: ConsultationStatus.SCHEDULED,
          slot: {
            ...mockAvailableSlot,
            startTime: pastStart,
            endTime: pastEnd,
            status: SlotStatus.BOOKED
          }
        } as never)
        .mockResolvedValueOnce({
          ...mockConsultation,
          status: ConsultationStatus.CANCELLED,
          cancellationReason: 'Missed appointment',
          slot: {
            ...mockAvailableSlot,
            startTime: pastStart,
            endTime: pastEnd,
            status: SlotStatus.BOOKED // Preserved as BOOKED, never restored to AVAILABLE
          }
        } as never);

      vi.spyOn(prisma.consultation, 'updateMany').mockResolvedValue({ count: 1 });
      const slotUpdateSpy = vi.spyOn(prisma.availabilitySlot, 'update');
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-cancel' } as never);

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Missed appointment' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Ensure availabilitySlot.update was NOT invoked to reopen the past slot
      expect(slotUpdateSpy).not.toHaveBeenCalled();
    });
  });
});
