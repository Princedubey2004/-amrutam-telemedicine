import crypto from 'crypto';
import {
  PrismaClient,
  Role,
  PaymentStatus,
  ConsultationStatus
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import { env } from '../../config/env';
import {
  NotFoundError,
  BadRequestError,
  ConflictError
} from '../../common/errors/AppError';
import { AuthUser } from '../../middleware/auth.middleware';
import { InitiatePaymentInput, WebhookPayload } from './payments.validation';

export class PaymentsService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Initiates a payment session for an active consultation booking.
   * Derives payment amount exclusively from trusted server-side data (consultation.fee).
   */
  async initiatePayment(patientId: string, input: InitiatePaymentInput) {
    // 1. Production safety check: Mock provider is strictly prohibited in production
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'mock') {
      throw new BadRequestError(
        'Mock payment provider is strictly disabled in production. A production payment gateway must be configured.'
      );
    }

    if (env.NODE_ENV === 'production' && !env.PAYMENT_KEY_ID) {
      throw new BadRequestError(
        'Payment gateway configuration is missing in the production environment.'
      );
    }

    // 2. Fetch consultation and inspect ownership and payment state
    const consultation = await this.db.consultation.findUnique({
      where: { id: input.consultationId },
      include: {
        payments: true
      }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    if (consultation.patientId !== patientId) {
      throw new NotFoundError('Consultation not found');
    }

    if (
      consultation.status === ConsultationStatus.CANCELLED ||
      consultation.status === ConsultationStatus.REJECTED
    ) {
      throw new BadRequestError('Cannot initiate payment for a cancelled or rejected consultation');
    }

    // 3. Prevent duplicate successful payments
    const existingSuccessfulPayment = consultation.payments.find(
      (p) => p.status === PaymentStatus.COMPLETED
    );

    if (existingSuccessfulPayment) {
      throw new ConflictError('This consultation has already been paid for');
    }

    // 4. Determine trusted amount and currency from server-side consultation fee
    const amount = consultation.fee;
    const currency = 'INR';

    // Generate unique transaction reference
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Development / mock order reference or gateway order creation
    const gatewayReference = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 5. Create PENDING payment record atomically with audit trail
    return this.db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          transactionId,
          consultationId: consultation.id,
          amount,
          currency,
          status: PaymentStatus.PENDING,
          method: input.method,
          gatewayReference
        },
        select: {
          id: true,
          transactionId: true,
          consultationId: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          gatewayReference: true,
          createdAt: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: patientId,
          action: 'PAYMENT_INITIATED',
          resourceType: 'PAYMENT',
          resourceId: payment.id,
          metadata: {
            consultationId: consultation.id,
            amount: amount.toString(),
            currency,
            transactionId
          }
        }
      });

      return {
        payment,
        provider: env.PAYMENT_PROVIDER
      };
    });
  }

  /**
   * Retrieves payment status and metadata with ownership verification.
   */
  async getPaymentById(paymentId: string, user: AuthUser) {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: {
        consultation: {
          select: {
            id: true,
            patientId: true,
            consultationNumber: true
          }
        }
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (user.role !== Role.ADMIN && payment.consultation.patientId !== user.id) {
      throw new NotFoundError('Payment not found');
    }

    return {
      id: payment.id,
      transactionId: payment.transactionId,
      consultationId: payment.consultationId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      gatewayReference: payment.gatewayReference,
      paidAt: payment.paidAt,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    };
  }

  /**
   * Securely processes provider webhook events with cryptographic HMAC signature verification,
   * idempotency protection against replayed events, and transactional state updates.
   */
  async processWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
    payload: WebhookPayload
  ) {
    // 1. Verify HMAC SHA-256 signature
    if (!signatureHeader) {
      throw new BadRequestError('Missing webhook signature header');
    }

    const secret = env.PAYMENT_WEBHOOK_SECRET;
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();

    if (
      cleanSignature.length !== computedHmac.length ||
      !crypto.timingSafeEqual(
        Buffer.from(cleanSignature, 'utf8'),
        Buffer.from(computedHmac, 'utf8')
      )
    ) {
      throw new BadRequestError('Invalid webhook signature');
    }

    // 2. Identify the target payment record
    const payment = await this.db.payment.findFirst({
      where: {
        OR: [
          ...(payload.data.transactionId ? [{ transactionId: payload.data.transactionId }] : []),
          ...(payload.data.gatewayReference ? [{ gatewayReference: payload.data.gatewayReference }] : [])
        ]
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment record not found for webhook event');
    }

    // 3. Process events transactionally with state transition rules
    const event = payload.event;

    if (event === 'payment.succeeded' || event === 'payment.captured') {
      // Idempotent replay: already completed
      if (payment.status === PaymentStatus.COMPLETED) {
        return {
          processed: true,
          idempotent: true,
          message: 'Webhook event already processed previously',
          status: payment.status
        };
      }

      // Invalid state transition
      if (
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.CANCELLED ||
        payment.status === PaymentStatus.REFUNDED
      ) {
        throw new BadRequestError(
          `Cannot mark payment as completed from terminal state '${payment.status}'`
        );
      }

      return this.db.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date()
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYMENT_COMPLETED',
            resourceType: 'PAYMENT',
            resourceId: payment.id,
            metadata: {
              transactionId: payment.transactionId,
              amount: payment.amount.toString(),
              gatewayReference: payment.gatewayReference
            }
          }
        });

        return {
          processed: true,
          idempotent: false,
          status: updated.status
        };
      });
    }

    if (event === 'payment.failed') {
      // Idempotent replay: already failed
      if (payment.status === PaymentStatus.FAILED) {
        return {
          processed: true,
          idempotent: true,
          message: 'Payment already recorded as failed',
          status: payment.status
        };
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        throw new BadRequestError('Cannot mark an already completed payment as failed');
      }

      return this.db.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: payload.data.failureReason || 'Payment failed by provider'
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYMENT_FAILED',
            resourceType: 'PAYMENT',
            resourceId: payment.id,
            metadata: {
              transactionId: payment.transactionId,
              failureReason: payload.data.failureReason
            }
          }
        });

        return {
          processed: true,
          idempotent: false,
          status: updated.status
        };
      });
    }

    if (event === 'payment.refunded') {
      if (payment.status === PaymentStatus.REFUNDED) {
        return {
          processed: true,
          idempotent: true,
          message: 'Payment already refunded',
          status: payment.status
        };
      }

      if (payment.status !== PaymentStatus.COMPLETED) {
        throw new BadRequestError('Only completed payments can be refunded');
      }

      return this.db.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.REFUNDED
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYMENT_REFUNDED',
            resourceType: 'PAYMENT',
            resourceId: payment.id,
            metadata: {
              transactionId: payment.transactionId
            }
          }
        });

        return {
          processed: true,
          idempotent: false,
          status: updated.status
        };
      });
    }

    throw new BadRequestError(`Unhandled payment event type: ${event}`);
  }
}

export const paymentsService = new PaymentsService();
