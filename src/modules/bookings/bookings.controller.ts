import { Request, Response, NextFunction } from 'express';
import { BookingsService, bookingsService as defaultBookingsService } from './bookings.service';
import { GetBookingsQuery } from './bookings.validation';

export class BookingsController {
  private bookingsService: BookingsService;

  constructor(service: BookingsService = defaultBookingsService) {
    this.bookingsService = service;
  }

  createBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyKey =
        (req.header('idempotency-key') || req.header('Idempotency-Key'))?.trim();

      const result = await this.bookingsService.createBooking(
        req.user!.id,
        req.body,
        idempotencyKey
      );

      if (result.isReplay) {
        res.setHeader('X-Idempotent-Replay', 'true');
      }

      res.status(result.statusCode).json({
        success: true,
        message: result.isReplay
          ? 'Booking retrieved from idempotent record'
          : 'Appointment booked successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  };

  getMyBookings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.bookingsService.getMyBookings(
        req.user!.id,
        req.query as unknown as GetBookingsQuery
      );

      res.status(200).json({
        success: true,
        data: result.bookings,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };

  getBookingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await this.bookingsService.getBookingById(
        req.params.id as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: booking
      });
    } catch (error) {
      next(error);
    }
  };

  cancelBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await this.bookingsService.cancelBooking(
        req.params.id as string,
        req.body,
        req.user!
      );

      res.status(200).json({
        success: true,
        message: 'Appointment cancelled successfully',
        data: booking
      });
    } catch (error) {
      next(error);
    }
  };
}

export const bookingsController = new BookingsController();
