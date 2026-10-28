import { Router } from 'express';
import { availabilityController } from './availability.controller';
import {
  createSlotSchema,
  getAvailabilityQuerySchema,
  availabilityDoctorParamSchema,
  availabilitySlotParamSchema
} from './availability.validation';
import { authenticate, validateRequest, validateQuery, validateParams } from '../../middleware';

// mergeParams: true allows access to parent router params (e.g. :doctorId)
export const availabilityRouter = Router({ mergeParams: true });

/**
 * @route   POST /api/v1/doctors/:doctorId/availability
 * @desc    Create doctor availability slot
 * @access  Protected (Doctor owner or Admin only)
 */
availabilityRouter.post(
  '/',
  authenticate,
  validateParams(availabilityDoctorParamSchema),
  validateRequest(createSlotSchema),
  availabilityController.createSlot
);

/**
 * @route   GET /api/v1/doctors/:doctorId/availability
 * @desc    Get public future available slots for a doctor
 * @access  Public
 */
availabilityRouter.get(
  '/',
  validateParams(availabilityDoctorParamSchema),
  validateQuery(getAvailabilityQuerySchema),
  availabilityController.getPublicDoctorAvailability
);

/**
 * @route   DELETE /api/v1/doctors/:doctorId/availability/:slotId
 * @desc    Cancel an availability slot
 * @access  Protected (Doctor owner or Admin only)
 */
availabilityRouter.delete(
  '/:slotId',
  authenticate,
  validateParams(availabilitySlotParamSchema),
  availabilityController.cancelSlot
);
