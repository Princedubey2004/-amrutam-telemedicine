import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const initiatePaymentSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation ID format'),
  method: z.nativeEnum(PaymentMethod).optional().default(PaymentMethod.UPI)
});

export const paymentIdParamSchema = z.object({
  id: z.string().uuid('Invalid payment ID format')
});

export const webhookPayloadSchema = z.object({
  event: z.enum([
    'payment.succeeded',
    'payment.captured',
    'payment.failed',
    'payment.refunded'
  ]),
  data: z.object({
    transactionId: z.string().optional(),
    gatewayReference: z.string().optional(),
    failureReason: z.string().optional()
  }).refine((data) => data.transactionId || data.gatewayReference, {
    message: 'Either transactionId or gatewayReference must be provided'
  })
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
