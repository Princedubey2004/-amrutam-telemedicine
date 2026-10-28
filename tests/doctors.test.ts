import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { Role, DoctorStatus, SlotStatus, ConsultationStatus } from '@prisma/client';

describe('Doctor Management and Availability API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createAuthToken = (userId: string, role: Role, email: string) => {
    return jwt.sign({ sub: userId, role, email }, env.JWT_SECRET, { expiresIn: '1h' });
  };

  const adminUserId = 'a0000000-0000-0000-0000-000000000001';
  const patientUserId = 'b0000000-0000-0000-0000-000000000002';
  const doctorUserId = 'c0000000-0000-0000-0000-000000000003';
  const otherDoctorUserId = 'd0000000-0000-0000-0000-000000000004';

  const adminToken = createAuthToken(adminUserId, Role.ADMIN, 'admin@amrutam.co.in');
  const patientToken = createAuthToken(patientUserId, Role.PATIENT, 'patient@example.com');
  const doctorToken = createAuthToken(doctorUserId, Role.DOCTOR, 'dr.sharma@amrutam.co.in');
  const otherDoctorToken = createAuthToken(otherDoctorUserId, Role.DOCTOR, 'dr.other@amrutam.co.in');

  const doctorId = '11111111-1111-1111-1111-111111111111';
  const otherDoctorId = '22222222-2222-2222-2222-222222222222';
  const slotId = '33333333-3333-3333-3333-333333333333';

  // -------------------------------------------------------------
  // FEATURE 1: DOCTOR MANAGEMENT
  // -------------------------------------------------------------

  describe('POST /api/v1/doctors', () => {
    const validDoctorPayload = {
      userId: doctorUserId,
      licenseNumber: 'AYUSH-DL-2026-9876',
      specialization: 'Ayurvedic Medicine & Panchakarma',
      experienceYears: 8,
      qualifications: ['BAMS', 'MD (Ayurveda)'],
      bio: 'Senior Ayurvedic physician specializing in holistic medicine.',
      consultationFee: 750
    };

    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .send(validDoctorPayload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('token is missing');
    });

    it('should reject non-admin users (PATIENT) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject non-admin users (DOCTOR) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 'invalid-uuid-format',
          licenseNumber: '',
          consultationFee: -50
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should return 404 Not Found when target user does not exist', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Target user not found');
    });

    it('should return 400 Bad Request when target user does not have DOCTOR role', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: doctorUserId,
        email: 'dr.sharma@amrutam.co.in',
        role: Role.PATIENT
      } as never);

      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Target user does not have the DOCTOR role');
    });

    it('should return 409 Conflict when user already has a doctor profile', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: doctorUserId,
        email: 'dr.sharma@amrutam.co.in',
        role: Role.DOCTOR
      } as never);

      vi.spyOn(prisma.doctor, 'findUnique').mockImplementation(async ({ where }: { where: { userId?: string; licenseNumber?: string } }) => {
        if (where.userId) {
          return { id: doctorId, userId: doctorUserId } as never;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('A doctor profile already exists for this user account');
    });

    it('should return 409 Conflict when medical license number is already registered', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: doctorUserId,
        email: 'dr.sharma@amrutam.co.in',
        role: Role.DOCTOR
      } as never);

      vi.spyOn(prisma.doctor, 'findUnique').mockImplementation(async ({ where }: { where: { userId?: string; licenseNumber?: string } }) => {
        if (where.userId) {
          return null;
        }
        if (where.licenseNumber) {
          return { id: otherDoctorId, licenseNumber: 'AYUSH-DL-2026-9876' } as never;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('A doctor with this license number already exists');
    });

    it('should successfully create doctor profile with 201 Created for ADMIN', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: doctorUserId,
        email: 'dr.sharma@amrutam.co.in',
        role: Role.DOCTOR
      } as never);

      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue(null);

      const mockCreatedDoctor = {
        id: doctorId,
        userId: doctorUserId,
        licenseNumber: 'AYUSH-DL-2026-9876',
        specialization: 'Ayurvedic Medicine & Panchakarma',
        experienceYears: 8,
        qualifications: ['BAMS', 'MD (Ayurveda)'],
        bio: 'Senior Ayurvedic physician specializing in holistic medicine.',
        consultationFee: '750',
        status: DoctorStatus.VERIFIED,
        createdAt: new Date('2026-10-28T12:00:00.000Z'),
        updatedAt: new Date('2026-10-28T12:00:00.000Z'),
        user: {
          id: doctorUserId,
          email: 'dr.sharma@amrutam.co.in',
          role: Role.DOCTOR,
          isActive: true,
          profile: {
            firstName: 'Aarav',
            lastName: 'Sharma',
            phoneNumber: '+919876543210',
            avatarUrl: 'https://example.com/avatar.jpg'
          }
        }
      };

      vi.spyOn(prisma.doctor, 'create').mockResolvedValue(mockCreatedDoctor as never);

      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDoctorPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Doctor profile created successfully');
      expect(res.body.data).toHaveProperty('id', doctorId);
      expect(res.body.data.licenseNumber).toBe('AYUSH-DL-2026-9876');
      expect(res.body.data.user.email).toBe('dr.sharma@amrutam.co.in');
    });
  });

  describe('GET /api/v1/doctors', () => {
    it('should publicly return a paginated list of verified active doctors', async () => {
      const mockDoctors = [
        {
          id: doctorId,
          specialization: 'Ayurveda',
          experienceYears: 10,
          qualifications: ['BAMS'],
          bio: 'Experienced doctor',
          consultationFee: '600',
          status: DoctorStatus.VERIFIED,
          createdAt: new Date(),
          user: {
            id: doctorUserId,
            email: 'dr.sharma@amrutam.co.in',
            profile: {
              firstName: 'Aarav',
              lastName: 'Sharma',
              avatarUrl: null
            }
          }
        }
      ];

      vi.spyOn(prisma.doctor, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.doctor, 'findMany').mockResolvedValue(mockDoctors as never);

      const res = await request(app)
        .get('/api/v1/doctors?page=1&limit=10&specialization=Ayurveda&minFee=500&maxFee=1000');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1
      });
    });

    it('should reject invalid query params where minFee > maxFee with 400', async () => {
      const res = await request(app)
        .get('/api/v1/doctors?minFee=1000&maxFee=500');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/doctors/:id', () => {
    it('should publicly return verified doctor profile by ID', async () => {
      const mockDoctor = {
        id: doctorId,
        specialization: 'Ayurveda',
        experienceYears: 10,
        qualifications: ['BAMS'],
        bio: 'Experienced doctor',
        consultationFee: '600',
        status: DoctorStatus.VERIFIED,
        createdAt: new Date(),
        user: {
          id: doctorUserId,
          email: 'dr.sharma@amrutam.co.in',
          profile: {
            firstName: 'Aarav',
            lastName: 'Sharma',
            phoneNumber: '+919876543210',
            avatarUrl: null
          }
        }
      };

      vi.spyOn(prisma.doctor, 'findFirst').mockResolvedValue(mockDoctor as never);

      const res = await request(app).get(`/api/v1/doctors/${doctorId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(doctorId);
      expect(res.body.data.specialization).toBe('Ayurveda');
    });

    it('should return 404 when doctor is not found or not verified', async () => {
      vi.spyOn(prisma.doctor, 'findFirst').mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/doctors/${doctorId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Doctor profile not found');
    });

    it('should return 400 when doctor ID is an invalid UUID', async () => {
      const res = await request(app).get('/api/v1/doctors/not-a-valid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------
  // FEATURE 2: DOCTOR AVAILABILITY
  // -------------------------------------------------------------

  describe('POST /api/v1/doctors/:doctorId/availability', () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000); // +1 hour

    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject PATIENT role with 403 Forbidden', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId } as never);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject a DOCTOR attempting to manage another doctor availability with 403', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockImplementation(async ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id === doctorId) {
          return { id: doctorId, userId: doctorUserId } as never;
        }
        if (where.userId === otherDoctorUserId) {
          return { id: otherDoctorId, userId: otherDoctorUserId } as never;
        }
        return null;
      });

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${otherDoctorToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject invalid time range where startTime >= endTime with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: futureEnd.toISOString(),
          endTime: futureStart.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should reject past startTime with 400 Bad Request', async () => {
      const pastStart = new Date(Date.now() - 60 * 60 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: pastStart.toISOString(),
          endTime: pastEnd.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('startTime cannot be in the past');
    });

    it('should reject slot duration less than 15 minutes with 400', async () => {
      const shortEnd = new Date(futureStart.getTime() + 10 * 60 * 1000); // 10 minutes

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: shortEnd.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('between 15 minutes and 4 hours');
    });

    it('should reject slot scheduled more than 90 days in advance with 400', async () => {
      const farFutureStart = new Date(Date.now() + 95 * 24 * 60 * 60 * 1000); // 95 days
      const farFutureEnd = new Date(farFutureStart.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: farFutureStart.toISOString(),
          endTime: farFutureEnd.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('90 days');
    });

    it('should return 409 Conflict when new slot overlaps with an existing slot', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue({
        id: 'existing-slot-id',
        doctorId,
        startTime: futureStart,
        endTime: futureEnd,
        status: SlotStatus.AVAILABLE
      } as never);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('overlaps');
    });

    it('should successfully create availability slot for owning doctor with 201 Created', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockImplementation(async ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id === doctorId) {
          return { id: doctorId, userId: doctorUserId } as never;
        }
        if (where.userId === doctorUserId) {
          return { id: doctorId, userId: doctorUserId } as never;
        }
        return null;
      });

      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue(null);

      const mockSlot = {
        id: slotId,
        doctorId,
        startTime: futureStart,
        endTime: futureEnd,
        status: SlotStatus.AVAILABLE,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.availabilitySlot, 'create').mockResolvedValue(mockSlot as never);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Availability slot created successfully');
      expect(res.body.data.id).toBe(slotId);
      expect(res.body.data.status).toBe(SlotStatus.AVAILABLE);
    });

    it('should successfully create availability slot when called by ADMIN', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue(null);

      const mockSlot = {
        id: slotId,
        doctorId,
        startTime: futureStart,
        endTime: futureEnd,
        status: SlotStatus.AVAILABLE,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.availabilitySlot, 'create').mockResolvedValue(mockSlot as never);

      const res = await request(app)
        .post(`/api/v1/doctors/${doctorId}/availability`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: futureStart.toISOString(),
          endTime: futureEnd.toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(slotId);
    });
  });

  describe('GET /api/v1/doctors/:doctorId/availability', () => {
    it('should publicly return future available slots with pagination', async () => {
      vi.spyOn(prisma.doctor, 'findFirst').mockResolvedValue({
        id: doctorId,
        status: DoctorStatus.VERIFIED,
        user: { isActive: true }
      } as never);

      const mockSlots = [
        {
          id: slotId,
          doctorId,
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
          status: SlotStatus.AVAILABLE,
          createdAt: new Date()
        }
      ];

      vi.spyOn(prisma.availabilitySlot, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.availabilitySlot, 'findMany').mockResolvedValue(mockSlots as never);

      const res = await request(app)
        .get(`/api/v1/doctors/${doctorId}/availability?page=1&limit=20`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('should return 404 if doctor is not found or not active', async () => {
      vi.spyOn(prisma.doctor, 'findFirst').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/doctors/${doctorId}/availability`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found or profile is not publicly active');
    });

    it('should return 400 when startDate is after endDate', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);

      const res = await request(app)
        .get(`/api/v1/doctors/${doctorId}/availability?startDate=${now.toISOString()}&endDate=${past.toISOString()}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });
  });

  describe('DELETE /api/v1/doctors/:doctorId/availability/:slotId', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject PATIENT with 403', async () => {
      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject another DOCTOR with 403', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: otherDoctorId, userId: otherDoctorUserId } as never);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${otherDoctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when slot does not exist', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Availability slot not found');
    });

    it('should return 400 Bad Request when slot is already cancelled', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.CANCELLED
      } as never);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Availability slot is already cancelled');
    });

    it('should return 400 Bad Request when slot has an active booked consultation', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.BOOKED
      } as never);

      vi.spyOn(prisma.consultation, 'findFirst').mockResolvedValue({
        id: 'consultation-active-123',
        slotId,
        status: ConsultationStatus.CONFIRMED
      } as never);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('active consultation is booked');
    });

    it('should successfully cancel availability slot for owning DOCTOR with 200 OK', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.AVAILABLE
      } as never);

      vi.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(null);

      const cancelledSlot = {
        id: slotId,
        doctorId,
        status: SlotStatus.CANCELLED,
        version: 1
      };

      vi.spyOn(prisma.availabilitySlot, 'update').mockResolvedValue(cancelledSlot as never);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Availability slot cancelled successfully');
      expect(res.body.data.status).toBe(SlotStatus.CANCELLED);
    });

    it('should successfully cancel availability slot when called by ADMIN with 200 OK', async () => {
      vi.spyOn(prisma.availabilitySlot, 'findFirst').mockResolvedValue({
        id: slotId,
        doctorId,
        status: SlotStatus.AVAILABLE
      } as never);

      vi.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(null);

      const cancelledSlot = {
        id: slotId,
        doctorId,
        status: SlotStatus.CANCELLED,
        version: 2
      };

      vi.spyOn(prisma.availabilitySlot, 'update').mockResolvedValue(cancelledSlot as never);

      const res = await request(app)
        .delete(`/api/v1/doctors/${doctorId}/availability/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(SlotStatus.CANCELLED);
    });
  });
});
