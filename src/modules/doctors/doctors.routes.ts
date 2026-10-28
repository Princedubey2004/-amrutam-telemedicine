import { Router } from 'express';
import { Role } from '@prisma/client';
import { doctorsController } from './doctors.controller';
import { createDoctorSchema, getDoctorsQuerySchema, doctorIdParamSchema } from './doctors.validation';
import { availabilityRouter } from '../availability/availability.routes';
import { authenticate, authorize, validateRequest, validateQuery, validateParams } from '../../middleware';

export const doctorsRouter = Router();

// Subroute for Doctor Availability
doctorsRouter.use('/:doctorId/availability', availabilityRouter);

/**
 * @route   POST /api/v1/doctors
 * @desc    Create a doctor profile for an existing user account
 * @access  Protected (ADMIN only)
 */
doctorsRouter.post(
  '/',
  authenticate,
  authorize(Role.ADMIN),
  validateRequest(createDoctorSchema),
  doctorsController.createDoctor
);

/**
 * @route   GET /api/v1/doctors
 * @desc    List verified, active doctors with pagination and filters
 * @access  Public
 */
doctorsRouter.get(
  '/',
  validateQuery(getDoctorsQuerySchema),
  doctorsController.getPublicDoctors
);

/**
 * @route   GET /api/v1/doctors/:id
 * @desc    Get public profile of a verified doctor
 * @access  Public
 */
doctorsRouter.get(
  '/:id',
  validateParams(doctorIdParamSchema),
  doctorsController.getPublicDoctorById
);
