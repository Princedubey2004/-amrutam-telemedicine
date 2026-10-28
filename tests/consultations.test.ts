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
  ConsultationStatus
} from '@prisma/client';

describe('Consultation and Prescription Modules Unit & API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createAuthToken = (userId: string, role: Role, email: string) => {
    return jwt.sign({ sub: userId, role, email }, env.JWT_SECRET, { expiresIn: '1h' });
  };

  const patientId = 'b0000000-0000-0000-0000-000000000002';
  const otherPatientId = 'e0000000-0000-0000-0000-000000000005';
  const doctorUserId = 'c0000000-0000-0000-0000-000000000003';
  const otherDoctorUserId = 'd0000000-0000-0000-0000-000000000004';
  const adminUserId = 'a0000000-0000-0000-0000-000000000001';

  const patientToken = createAuthToken(patientId, Role.PATIENT, 'patient@example.com');
  const otherPatientToken = createAuthToken(otherPatientId, Role.PATIENT, 'other.patient@example.com');
  const doctorToken = createAuthToken(doctorUserId, Role.DOCTOR, 'doctor@amrutam.co.in');
  const otherDoctorToken = createAuthToken(otherDoctorUserId, Role.DOCTOR, 'other.doctor@amrutam.co.in');
  const adminToken = createAuthToken(adminUserId, Role.ADMIN, 'admin@amrutam.co.in');

  const doctorId = '11111111-1111-1111-1111-111111111111';
  const otherDoctorId = '22222222-2222-2222-2222-222222222222';
  const slotId = '33333333-3333-3333-3333-333333333333';
  const consultationId = '44444444-4444-4444-4444-444444444444';
  const prescriptionId = '55555555-5555-5555-5555-555555555555';

  const mockConsultation = {
    id: consultationId,
    consultationNumber: 'AMR-1730100000000-ABCDEF',
    patientId,
    doctorId,
    slotId,
    status: ConsultationStatus.SCHEDULED,
    fee: '850.00',
    symptomsSummary: 'Chronic fatigue and joint pain',
    notes: 'Prior history of arthritis',
    startedAt: null,
    endedAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    doctor: {
      id: doctorId,
      userId: doctorUserId,
      specialization: 'Ayurveda',
      consultationFee: '850.00',
      user: {
        id: doctorUserId,
        email: 'doctor@amrutam.co.in',
        profile: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      }
    },
    patient: {
      id: patientId,
      email: 'patient@example.com',
      profile: {
        firstName: 'Rahul',
        lastName: 'Verma',
        phoneNumber: '+919811122233',
        avatarUrl: null
      }
    },
    slot: {
      id: slotId,
      startTime: new Date(Date.now() + 86400000),
      endTime: new Date(Date.now() + 86400000 + 2700000),
      status: SlotStatus.BOOKED
    },
    prescriptions: []
  };

  const mockPrescription = {
    id: prescriptionId,
    prescriptionNumber: 'RX-1730100000000-KLMNOP',
    consultationId,
    diagnosis: 'Vata-Pitta Imbalance leading to Joint Pain',
    instructions: 'Consume with warm water after meals',
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        prescriptionId,
        medicineName: 'Ashwagandha Tablets',
        dosage: '500mg',
        frequency: 'Twice daily after meals',
        durationDays: 30,
        instructions: 'Take with warm milk',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'item-2',
        prescriptionId,
        medicineName: 'Yograj Guggulu',
        dosage: '250mg',
        frequency: 'Once daily in the morning',
        durationDays: 15,
        instructions: 'Take after breakfast',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
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
  // 1. GET /api/v1/consultations
  // -------------------------------------------------------------

  describe('GET /api/v1/consultations', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/consultations');
      expect(res.status).toBe(401);
    });

    it('should return only own consultations for authenticated PATIENT', async () => {
      vi.spyOn(prisma.consultation, 'count').mockResolvedValue(1);
      const findManySpy = vi.spyOn(prisma.consultation, 'findMany').mockResolvedValue([mockConsultation] as never);

      const res = await request(app)
        .get('/api/v1/consultations?page=1&limit=10')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientId })
        })
      );
    });

    it('should return only assigned consultations for authenticated DOCTOR', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'count').mockResolvedValue(1);
      const findManySpy = vi.spyOn(prisma.consultation, 'findMany').mockResolvedValue([mockConsultation] as never);

      const res = await request(app)
        .get('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ doctorId })
        })
      );
    });
  });

  // -------------------------------------------------------------
  // 2. GET /api/v1/consultations/:id
  // -------------------------------------------------------------

  describe('GET /api/v1/consultations/:id', () => {
    it('should allow patient to access their own consultation', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(consultationId);
    });

    it('should deny patient access to another patient consultation with 404', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Consultation not found');
    });

    it('should allow assigned doctor to access consultation', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(consultationId);
    });

    it('should deny access to a doctor not assigned to this consultation with 404', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: otherDoctorId, userId: otherDoctorUserId } as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${otherDoctorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Consultation not found');
    });

    it('should allow ADMIN to access any consultation', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(consultationId);
    });
  });

  // -------------------------------------------------------------
  // 3. POST /api/v1/consultations/:id/start
  // -------------------------------------------------------------

  describe('POST /api/v1/consultations/:id/start', () => {
    it('should reject PATIENT attempt to start a consultation with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject unassigned DOCTOR attempt to start consultation with 403', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: otherDoctorId, userId: otherDoctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({ doctorId } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${otherDoctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('assigned to another doctor');
    });

    it('should allow assigned DOCTOR to start a SCHEDULED consultation', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never) // In verifyDoctorOrAdminAccess
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.SCHEDULED } as never) // Current state check
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.IN_PROGRESS, startedAt: new Date() } as never); // Final return

      vi.spyOn(prisma.consultation, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-start' } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Consultation started successfully');
      expect(res.body.data.status).toBe(ConsultationStatus.IN_PROGRESS);
    });

    it('should reject starting an already IN_PROGRESS consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.IN_PROGRESS } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already in progress');
    });

    it('should reject starting a COMPLETED consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.COMPLETED } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already completed');
    });

    it('should reject starting a CANCELLED consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.CANCELLED } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/start`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('cancelled or rejected');
    });
  });

  // -------------------------------------------------------------
  // 4. POST /api/v1/consultations/:id/complete
  // -------------------------------------------------------------

  describe('POST /api/v1/consultations/:id/complete', () => {
    it('should reject PATIENT attempt to complete consultation with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/complete`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow assigned DOCTOR to complete an IN_PROGRESS consultation', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.IN_PROGRESS } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.COMPLETED, endedAt: new Date() } as never);

      vi.spyOn(prisma.consultation, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-complete' } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Consultation completed successfully');
      expect(res.body.data.status).toBe(ConsultationStatus.COMPLETED);
    });

    it('should reject completing a consultation that is not in progress with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.SCHEDULED } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Only in-progress consultations');
    });

    it('should reject completing an already COMPLETED consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique')
        .mockResolvedValueOnce({ doctorId } as never)
        .mockResolvedValueOnce({ ...mockConsultation, status: ConsultationStatus.COMPLETED } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been completed');
    });
  });

  // -------------------------------------------------------------
  // 5. POST /api/v1/consultations/:id/prescriptions
  // -------------------------------------------------------------

  describe('POST /api/v1/consultations/:id/prescriptions', () => {
    const validPrescriptionPayload = {
      diagnosis: 'Vata-Pitta Imbalance leading to Joint Pain',
      instructions: 'Consume with warm water after meals',
      items: [
        {
          medicineName: 'Ashwagandha Tablets',
          dosage: '500mg',
          frequency: 'Twice daily after meals',
          durationDays: 30,
          instructions: 'Take with warm milk'
        }
      ]
    };

    it('should reject PATIENT attempt to issue a prescription with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(validPrescriptionPayload);

      expect(res.status).toBe(403);
    });

    it('should reject prescription with empty items array with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          diagnosis: 'General malaise',
          items: []
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should reject prescription with negative or zero durationDays with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          diagnosis: 'General malaise',
          items: [
            {
              medicineName: 'Triphala Churna',
              dosage: '5g',
              frequency: 'Bedtime',
              durationDays: 0
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject issuing prescription for SCHEDULED consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.SCHEDULED
      } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validPrescriptionPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('in-progress or completed');
    });

    it('should reject duplicate prescription creation for the same consultation with 409 Conflict', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.IN_PROGRESS
      } as never);

      vi.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(mockPrescription as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validPrescriptionPayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been issued');
    });

    it('should atomically create prescription and items for IN_PROGRESS consultation with 201 Created', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.IN_PROGRESS
      } as never);

      vi.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.prescription, 'create').mockResolvedValue(mockPrescription as never);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-rx' } as never);

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validPrescriptionPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Prescription issued successfully');
      expect(res.body.data.id).toBe(prescriptionId);
      expect(res.body.data.items).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------
  // 6. GET /api/v1/consultations/:id/prescription
  // -------------------------------------------------------------

  describe('GET /api/v1/consultations/:id/prescription', () => {
    it('should allow consultation patient to view prescription', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(mockPrescription as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(prescriptionId);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should allow assigned DOCTOR to view prescription', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.doctor, 'findUnique').mockResolvedValue({ id: doctorId, userId: doctorUserId } as never);
      vi.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(mockPrescription as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(prescriptionId);
    });

    it('should deny unauthorized patient from accessing prescription with 404', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Consultation not found');
    });

    it('should return 404 if no prescription has been issued yet', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);
      vi.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('No prescription has been issued');
    });
  });
});
