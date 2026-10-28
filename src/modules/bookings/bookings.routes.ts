import { Router } from 'express';
import { Role } from '@prisma/client';
import { bookingsController } from './bookings.controller';
import {
  createBookingSchema,
  getBookingsQuerySchema,
  bookingIdParamSchema,
  cancelBookingSchema
} from './bookings.validation';
import {
  authenticate,
  authorize,
  validateRequest,
  validateQuery,
  validateParams
} from '../../middleware';

export const bookingsRouter = Router();

/**
 * @route   POST /api/v1/bookings
 * @desc    Book an appointment for an available doctor slot
 * @access  Protected (PATIENT only)
 */
bookingsRouter.post(
  '/',
  authenticate,
  authorize(Role.PATIENT),
  validateRequest(createBookingSchema),
  bookingsController.createBooking
);

/**
 * @route   GET /api/v1/bookings
 * @desc    List appointments booked by the authenticated patient
 * @access  Protected (PATIENT only)
 */
bookingsRouter.get(
  '/',
  authenticate,
  authorize(Role.PATIENT),
  validateQuery(getBookingsQuerySchema),
  bookingsController.getMyBookings
);

/**
 * @route   GET /api/v1/bookings/:id
 * @desc    Get details of a specific booking
 * @access  Protected (Owning Patient or ADMIN)
 */
bookingsRouter.get(
  '/:id',
  authenticate,
  validateParams(bookingIdParamSchema),
  bookingsController.getBookingById
);

/**
 * @route   POST /api/v1/bookings/:id/cancel
 * @desc    Cancel an appointment booking
 * @access  Protected (Owning Patient or ADMIN)
 */
bookingsRouter.post(
  '/:id/cancel',
  authenticate,
  validateParams(bookingIdParamSchema),
  validateRequest(cancelBookingSchema),
  bookingsController.cancelBooking
);
