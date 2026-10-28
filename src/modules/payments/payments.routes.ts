import { Router } from 'express';
import { Role } from '@prisma/client';
import { paymentsController } from './payments.controller';
import {
  initiatePaymentSchema,
  paymentIdParamSchema,
  webhookPayloadSchema
} from './payments.validation';
import {
  authenticate,
  authorize,
  validateRequest,
  validateParams
} from '../../middleware';

export const paymentsRouter = Router();

/**
 * @route   POST /api/v1/payments/initiate
 * @desc    Initiate a payment session for an active consultation booking
 * @access  Protected (PATIENT only)
 */
paymentsRouter.post(
  '/initiate',
  authenticate,
  authorize(Role.PATIENT),
  validateRequest(initiatePaymentSchema),
  paymentsController.initiatePayment
);

/**
 * @route   GET /api/v1/payments/:id
 * @desc    Get status and metadata for a payment
 * @access  Protected (Payment Owner or ADMIN)
 */
paymentsRouter.get(
  '/:id',
  authenticate,
  validateParams(paymentIdParamSchema),
  paymentsController.getPaymentById
);

/**
 * @route   POST /api/v1/payments/webhook
 * @desc    Handle asynchronous provider payment notifications with signature verification
 * @access  Public (Cryptographically verified via HMAC SHA-256 signature)
 */
paymentsRouter.post(
  '/webhook',
  validateRequest(webhookPayloadSchema),
  paymentsController.processWebhook
);
