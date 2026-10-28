import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import {
  Role,
  DoctorStatus,
  ConsultationStatus,
  PaymentStatus
} from '@prisma/client';

describe('Admin Analytics Module Unit & API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createAuthToken = (userId: string, role: Role, email: string) => {
    return jwt.sign({ sub: userId, role, email }, env.JWT_SECRET, { expiresIn: '1h' });
  };

  const adminToken = createAuthToken('admin-uuid-001', Role.ADMIN, 'admin@amrutam.co.in');
  const patientToken = createAuthToken('patient-uuid-002', Role.PATIENT, 'patient@example.com');
  const doctorToken = createAuthToken('doctor-uuid-003', Role.DOCTOR, 'doctor@amrutam.co.in');

  const doctorId = '11111111-1111-1111-1111-111111111111';

  // -------------------------------------------------------------
  // 1. RBAC & AUTHORIZATION CHECKS
  // -------------------------------------------------------------

  describe('RBAC Authorization', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/admin/analytics/summary');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject PATIENT role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should reject DOCTOR role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should allow ADMIN role to access analytics', async () => {
      vi.spyOn(prisma.user, 'count').mockResolvedValue(10);
      vi.spyOn(prisma.doctor, 'count').mockResolvedValue(2);
      vi.spyOn(prisma.consultation, 'count').mockResolvedValue(5);
      vi.spyOn(prisma.consultation, 'groupBy').mockResolvedValue([] as never);
      vi.spyOn(prisma.payment, 'groupBy').mockResolvedValue([] as never);
      vi.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
        _sum: { amount: null },
        _count: { id: 0 }
      } as never);

      const res = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('users');
      expect(res.body.data).toHaveProperty('consultations');
      expect(res.body.data).toHaveProperty('payments');
    });
  });

  // -------------------------------------------------------------
  // 2. GET /api/v1/admin/analytics/summary
  // -------------------------------------------------------------

  describe('GET /api/v1/admin/analytics/summary', () => {
    it('should handle an empty database safely and return valid zeros', async () => {
      vi.spyOn(prisma.user, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.doctor, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.consultation, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.consultation, 'groupBy').mockResolvedValue([] as never);
      vi.spyOn(prisma.payment, 'groupBy').mockResolvedValue([] as never);
      vi.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
        _sum: { amount: null },
        _count: { id: 0 }
      } as never);

      const res = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        users: {
          total: 0,
          activePatients: 0,
          verifiedDoctors: 0
        },
        consultations: {
          total: 0,
          upcoming: 0,
          byStatus: {}
        },
        payments: {
          totalTransactions: 0,
          byStatus: {},
          revenue: {
            totalCompletedAmount: 0,
            currency: 'INR',
            completedCount: 0
          }
        }
      });
    });

    it('should return accurate consultation status counts and strictly exclude unsuccessful payments from revenue', async () => {
      vi.spyOn(prisma.user, 'count')
        .mockResolvedValueOnce(50) // Total users
        .mockResolvedValueOnce(40); // Active patients

      vi.spyOn(prisma.doctor, 'count').mockResolvedValue(10); // Verified doctors

      vi.spyOn(prisma.consultation, 'count')
        .mockResolvedValueOnce(25) // Total consultations
        .mockResolvedValueOnce(8); // Upcoming consultations

      vi.spyOn(prisma.consultation, 'groupBy').mockResolvedValue([
        { status: ConsultationStatus.SCHEDULED, _count: { id: 8 } },
        { status: ConsultationStatus.COMPLETED, _count: { id: 14 } },
        { status: ConsultationStatus.CANCELLED, _count: { id: 3 } }
      ] as never);

      vi.spyOn(prisma.payment, 'groupBy').mockResolvedValue([
        { status: PaymentStatus.COMPLETED, _count: { id: 14 } },
        { status: PaymentStatus.PENDING, _count: { id: 4 } },
        { status: PaymentStatus.FAILED, _count: { id: 2 } }
      ] as never);

      // Successfully completed payments sum
      vi.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
        _sum: { amount: '11900.00' },
        _count: { id: 14 }
      } as never);

      const res = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.total).toBe(50);
      expect(res.body.data.users.activePatients).toBe(40);
      expect(res.body.data.users.verifiedDoctors).toBe(10);

      expect(res.body.data.consultations.total).toBe(25);
      expect(res.body.data.consultations.upcoming).toBe(8);
      expect(res.body.data.consultations.byStatus).toEqual({
        SCHEDULED: 8,
        COMPLETED: 14,
        CANCELLED: 3
      });

      expect(res.body.data.payments.totalTransactions).toBe(20);
      expect(res.body.data.payments.revenue.totalCompletedAmount).toBe(11900);
      expect(res.body.data.payments.revenue.completedCount).toBe(14);
      expect(res.body.data.payments.revenue.currency).toBe('INR');

      // Verify no sensitive medical information is leaked
      expect(JSON.stringify(res.body)).not.toContain('symptoms');
      expect(JSON.stringify(res.body)).not.toContain('diagnosis');
      expect(JSON.stringify(res.body)).not.toContain('prescription');
    });
  });

  // -------------------------------------------------------------
  // 3. GET /api/v1/admin/analytics/trends
  // -------------------------------------------------------------

  describe('GET /api/v1/admin/analytics/trends', () => {
    it('should reject invalid date range where startDate > endDate with 400 Bad Request', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400000);

      const res = await request(app)
        .get(`/api/v1/admin/analytics/trends?startDate=${now.toISOString()}&endDate=${past.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should reject excessively broad date range exceeding 90 days for daily interval with 400', async () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-05-01T00:00:00.000Z'); // 120 days

      const res = await request(app)
        .get(`/api/v1/admin/analytics/trends?interval=day&startDate=${start.toISOString()}&endDate=${end.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('should return chronological daily trends combining consultations and completed revenue', async () => {
      const start = new Date('2026-10-01T00:00:00.000Z');
      const end = new Date('2026-10-15T00:00:00.000Z');

      vi.spyOn(prisma.consultation, 'findMany').mockResolvedValue([
        { createdAt: new Date('2026-10-05T10:00:00.000Z'), status: ConsultationStatus.COMPLETED },
        { createdAt: new Date('2026-10-05T14:00:00.000Z'), status: ConsultationStatus.SCHEDULED },
        { createdAt: new Date('2026-10-06T11:00:00.000Z'), status: ConsultationStatus.CANCELLED }
      ] as never);

      vi.spyOn(prisma.payment, 'findMany').mockResolvedValue([
        { paidAt: new Date('2026-10-05T10:05:00.000Z'), amount: '850.00' },
        { paidAt: new Date('2026-10-06T12:00:00.000Z'), amount: '600.00' }
      ] as never);

      const res = await request(app)
        .get(`/api/v1/admin/analytics/trends?interval=day&startDate=${start.toISOString()}&endDate=${end.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('INR');
      expect(res.body.data.data).toHaveLength(2);

      const day1 = res.body.data.data[0];
      expect(day1.date).toBe('2026-10-05');
      expect(day1.consultationsTotal).toBe(2);
      expect(day1.consultationsCompleted).toBe(1);
      expect(day1.revenueAmount).toBe(850);

      const day2 = res.body.data.data[1];
      expect(day2.date).toBe('2026-10-06');
      expect(day2.consultationsTotal).toBe(1);
      expect(day2.consultationsCancelled).toBe(1);
      expect(day2.revenueAmount).toBe(600);
    });
  });

  // -------------------------------------------------------------
  // 4. GET /api/v1/admin/analytics/doctors
  // -------------------------------------------------------------

  describe('GET /api/v1/admin/analytics/doctors', () => {
    it('should return doctor performance metrics and support pagination', async () => {
      const mockDoctors = [
        {
          id: doctorId,
          licenseNumber: 'AYU-DL-2024-00876',
          specialization: 'Ayurvedic Medicine',
          status: DoctorStatus.VERIFIED,
          consultationFee: '750.00',
          user: {
            email: 'dr.sharma@amrutam.co.in',
            profile: {
              firstName: 'Ananya',
              lastName: 'Sharma'
            }
          },
          consultations: [
            {
              id: 'c-1',
              status: ConsultationStatus.COMPLETED,
              fee: '750.00',
              payments: [{ amount: '750.00' }]
            },
            {
              id: 'c-2',
              status: ConsultationStatus.CANCELLED,
              fee: '750.00',
              payments: []
            }
          ]
        }
      ];

      vi.spyOn(prisma.doctor, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.doctor, 'findMany').mockResolvedValue(mockDoctors as never);

      const res = await request(app)
        .get('/api/v1/admin/analytics/doctors?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1
      });

      const doc = res.body.data[0];
      expect(doc.id).toBe(doctorId);
      expect(doc.doctorName).toBe('Dr. Ananya Sharma');
      expect(doc.specialization).toBe('Ayurvedic Medicine');
      expect(doc.metrics).toEqual({
        totalConsultations: 2,
        completedConsultations: 1,
        cancelledConsultations: 1,
        totalRevenueGenerated: 750,
        currency: 'INR'
      });

      // Verify no patient information is disclosed in doctor statistics
      expect(JSON.stringify(res.body)).not.toContain('patient');
      expect(JSON.stringify(res.body)).not.toContain('patientId');
      expect(JSON.stringify(res.body)).not.toContain('symptoms');
    });
  });

  // -------------------------------------------------------------
  // 5. DATABASE ERROR SAFETY
  // -------------------------------------------------------------

  describe('Database Error Handling', () => {
    it('should safely handle unexpected database errors with 500 without leaking stack traces or SQL details in production mode', async () => {
      const originalEnv = env.NODE_ENV;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = 'production';

        vi.spyOn(prisma.user, 'count').mockRejectedValue(new Error('FATAL: database connection lost'));

        const res = await request(app)
          .get('/api/v1/admin/analytics/summary')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toBe('Internal Server Error');
        expect(res.body.error).not.toHaveProperty('stack');
        expect(JSON.stringify(res.body)).not.toContain('FATAL');
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });
  });
});
