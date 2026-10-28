import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import {
  Role,
  PaymentStatus,
  PaymentMethod,
  ConsultationStatus
} from '@prisma/client';

describe('Payment Module Unit & API Tests', () => {
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
  const doctorToken = createAuthToken(doctorUserId, Role.DOCTOR, 'doctor@amrutam.co.in');
  const adminToken = createAuthToken(adminUserId, Role.ADMIN, 'admin@amrutam.co.in');

  const consultationId = '44444444-4444-4444-4444-444444444444';
  const otherConsultationId = '99999999-9999-9999-9999-999999999999';
  const paymentId = '66666666-6666-6666-6666-666666666666';
  const transactionId = 'TXN-1730100000000-ABCDEF';
  const gatewayReference = 'order_mock_1730100000000_xyz';

  const mockConsultation = {
    id: consultationId,
    consultationNumber: 'AMR-1730100000000-ABCDEF',
    patientId,
    doctorId: '11111111-1111-1111-1111-111111111111',
    slotId: '33333333-3333-3333-3333-333333333333',
    status: ConsultationStatus.SCHEDULED,
    fee: '850.00',
    symptomsSummary: 'Health inquiry',
    notes: null,
    startedAt: null,
    endedAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    payments: []
  };

  const mockPayment = {
    id: paymentId,
    transactionId,
    consultationId,
    amount: '850.00',
    currency: 'INR',
    status: PaymentStatus.PENDING,
    method: PaymentMethod.UPI,
    gatewayReference,
    failureReason: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    consultation: {
      id: consultationId,
      patientId,
      consultationNumber: 'AMR-1730100000000-ABCDEF'
    }
  };

  const mockTransactionExecution = (callbackResult: unknown) => {
    vi.spyOn(prisma, '$transaction').mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return callbackResult;
    });
  };

  const computeWebhookSignature = (payload: object) => {
    const raw = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(raw)
      .digest('hex');
  };

  // -------------------------------------------------------------
  // 1. POST /api/v1/payments/initiate
  // -------------------------------------------------------------

  describe('POST /api/v1/payments/initiate', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .send({ consultationId });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-patient users (DOCTOR) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultationId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when consultation does not exist', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ consultationId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Consultation not found');
    });

    it('should deny payment initiation for another patient consultation with 404', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${otherPatientToken}`)
        .send({ consultationId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Consultation not found');
    });

    it('should reject payment initiation for cancelled consultation with 400 Bad Request', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        status: ConsultationStatus.CANCELLED
      } as never);

      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ consultationId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('cancelled or rejected');
    });

    it('should prevent duplicate payment initiation if consultation is already paid with 409 Conflict', async () => {
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({
        ...mockConsultation,
        payments: [
          {
            id: 'paid-1',
            status: PaymentStatus.COMPLETED
          }
        ]
      } as never);

      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ consultationId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been paid for');
    });

    it('should successfully initiate payment using trusted DB fee and set status to PENDING', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

      const paymentCreateSpy = vi.spyOn(prisma.payment, 'create').mockResolvedValue({
        id: paymentId,
        transactionId,
        consultationId,
        amount: '850.00',
        currency: 'INR',
        status: PaymentStatus.PENDING,
        method: PaymentMethod.UPI,
        gatewayReference,
        createdAt: new Date()
      } as never);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-pay' } as never);

      // Client attempts to tamper with amount: 1.00
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          consultationId,
          method: 'UPI',
          amount: 1.00 // Client tampering attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Payment initiated successfully');
      expect(res.body.data.payment.status).toBe(PaymentStatus.PENDING);
      expect(res.body.data.payment.amount).toBe('850.00'); // Validated: trusted server amount used

      expect(paymentCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: '850.00',
            status: PaymentStatus.PENDING
          })
        })
      );
    });

    it('should fail safely if mock provider is attempted in production', async () => {
      const originalEnv = env.NODE_ENV;
      const originalProvider = env.PAYMENT_PROVIDER;

      try {
        (env as { NODE_ENV: string }).NODE_ENV = 'production';
        (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = 'mock';

        vi.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(mockConsultation as never);

        const res = await request(app)
          .post('/api/v1/payments/initiate')
          .set('Authorization', `Bearer ${patientToken}`)
          .send({ consultationId });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toContain('Mock payment provider is strictly disabled in production');
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
        (env as { PAYMENT_PROVIDER: string }).PAYMENT_PROVIDER = originalProvider;
      }
    });
  });

  // -------------------------------------------------------------
  // 2. GET /api/v1/payments/:id
  // -------------------------------------------------------------

  describe('GET /api/v1/payments/:id', () => {
    it('should allow payment owner to view safe payment status', async () => {
      vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(mockPayment as never);

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(paymentId);
      expect(res.body.data.status).toBe(PaymentStatus.PENDING);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    it('should deny access to unauthorized patient with 404', async () => {
      vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(mockPayment as never);

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Payment not found');
    });

    it('should allow ADMIN to view payment status', async () => {
      vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(mockPayment as never);

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(paymentId);
    });

    it('should return 404 for nonexistent payment ID', async () => {
      vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. POST /api/v1/payments/webhook
  // -------------------------------------------------------------

  describe('POST /api/v1/payments/webhook', () => {
    const validSuccessPayload = {
      event: 'payment.succeeded' as const,
      data: {
        transactionId,
        gatewayReference
      }
    };

    it('should reject webhook request missing signature header with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .send(validSuccessPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Missing webhook signature');
    });

    it('should reject webhook request with invalid signature with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-payment-signature', 'invalid-tampered-signature-hex')
        .send(validSuccessPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid webhook signature');
    });

    it('should process payment.succeeded and transition payment to COMPLETED', async () => {
      mockTransactionExecution(null);
      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.PENDING
      } as never);

      const paymentUpdateSpy = vi.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date()
      } as never);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-complete' } as never);

      const signature = computeWebhookSignature(validSuccessPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(validSuccessPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.processed).toBe(true);
      expect(res.body.idempotent).toBe(false);
      expect(res.body.status).toBe(PaymentStatus.COMPLETED);

      expect(paymentUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED
          })
        })
      );
    });

    it('should handle replayed payment.succeeded event idempotently without duplicating processing', async () => {
      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date()
      } as never);

      const updateSpy = vi.spyOn(prisma.payment, 'update');
      const signature = computeWebhookSignature(validSuccessPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(validSuccessPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.processed).toBe(true);
      expect(res.body.idempotent).toBe(true);
      expect(res.body.message).toContain('already processed');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should process payment.failed event and transition payment to FAILED', async () => {
      mockTransactionExecution(null);
      const failedPayload = {
        event: 'payment.failed' as const,
        data: {
          transactionId,
          failureReason: 'Insufficient funds in account'
        }
      };

      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.PENDING
      } as never);

      vi.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
        failureReason: 'Insufficient funds in account'
      } as never);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-failed' } as never);

      const signature = computeWebhookSignature(failedPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(failedPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe(PaymentStatus.FAILED);
    });

    it('should reject out-of-order transition marking a FAILED payment as COMPLETED', async () => {
      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
        failureReason: 'Expired payment'
      } as never);

      const signature = computeWebhookSignature(validSuccessPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(validSuccessPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot mark payment as completed from terminal state');
    });

    it('should reject out-of-order transition marking a COMPLETED payment as FAILED', async () => {
      const failedPayload = {
        event: 'payment.failed' as const,
        data: {
          transactionId,
          failureReason: 'Delayed network drop'
        }
      };

      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date()
      } as never);

      const signature = computeWebhookSignature(failedPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(failedPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot mark an already completed payment as failed');
    });

    it('should process payment.refunded for COMPLETED payment and transition to REFUNDED', async () => {
      mockTransactionExecution(null);
      const refundPayload = {
        event: 'payment.refunded' as const,
        data: {
          transactionId
        }
      };

      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED
      } as never);

      vi.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.REFUNDED
      } as never);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-refund' } as never);

      const signature = computeWebhookSignature(refundPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(refundPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe(PaymentStatus.REFUNDED);
    });
  });
});
