import { Router } from 'express';
import { Role } from '@prisma/client';
import { consultationsController } from './consultations.controller';
import {
  getConsultationsQuerySchema,
  consultationIdParamSchema,
  createPrescriptionSchema
} from './consultations.validation';
import {
  authenticate,
  authorize,
  validateRequest,
  validateQuery,
  validateParams
} from '../../middleware';

export const consultationsRouter = Router();

/**
 * @route   GET /api/v1/consultations
 * @desc    List consultations for the authenticated user (scoped by role)
 * @access  Protected (All authenticated roles)
 */
consultationsRouter.get(
  '/',
  authenticate,
  validateQuery(getConsultationsQuerySchema),
  consultationsController.getConsultations
);

/**
 * @route   GET /api/v1/consultations/:id
 * @desc    Get details of a single consultation
 * @access  Protected (Consultation's Patient, Assigned Doctor, or ADMIN)
 */
consultationsRouter.get(
  '/:id',
  authenticate,
  validateParams(consultationIdParamSchema),
  consultationsController.getConsultationById
);

/**
 * @route   POST /api/v1/consultations/:id/start
 * @desc    Start an active consultation (transitions to IN_PROGRESS)
 * @access  Protected (Assigned DOCTOR or ADMIN)
 */
consultationsRouter.post(
  '/:id/start',
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validateParams(consultationIdParamSchema),
  consultationsController.startConsultation
);

/**
 * @route   POST /api/v1/consultations/:id/complete
 * @desc    Complete an in-progress consultation (transitions to COMPLETED)
 * @access  Protected (Assigned DOCTOR or ADMIN)
 */
consultationsRouter.post(
  '/:id/complete',
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validateParams(consultationIdParamSchema),
  consultationsController.completeConsultation
);

/**
 * @route   POST /api/v1/consultations/:id/prescriptions
 * @desc    Issue a medical prescription for a consultation
 * @access  Protected (Assigned DOCTOR or ADMIN)
 */
consultationsRouter.post(
  '/:id/prescriptions',
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validateParams(consultationIdParamSchema),
  validateRequest(createPrescriptionSchema),
  consultationsController.createPrescription
);

/**
 * @route   GET /api/v1/consultations/:id/prescription
 * @desc    Retrieve the prescription and items for a consultation
 * @access  Protected (Consultation's Patient, Assigned Doctor, or ADMIN)
 */
consultationsRouter.get(
  '/:id/prescription',
  authenticate,
  validateParams(consultationIdParamSchema),
  consultationsController.getPrescription
);

// Support plural alias for convenience
consultationsRouter.get(
  '/:id/prescriptions',
  authenticate,
  validateParams(consultationIdParamSchema),
  consultationsController.getPrescription
);
