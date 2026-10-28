import { Request, Response, NextFunction } from 'express';
import { AvailabilityService, availabilityService as defaultAvailabilityService } from './availability.service';
import { GetAvailabilityQuery } from './availability.validation';

export class AvailabilityController {
  private availabilityService: AvailabilityService;

  constructor(service: AvailabilityService = defaultAvailabilityService) {
    this.availabilityService = service;
  }

  createSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctorId = req.params.doctorId as string;
      const slot = await this.availabilityService.createSlot(doctorId, req.body, req.user!);
      res.status(201).json({
        success: true,
        message: 'Availability slot created successfully',
        data: slot
      });
    } catch (error) {
      next(error);
    }
  };

  getPublicDoctorAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctorId = req.params.doctorId as string;
      const result = await this.availabilityService.getPublicDoctorAvailability(
        doctorId,
        req.query as unknown as GetAvailabilityQuery
      );
      res.status(200).json({
        success: true,
        data: result.slots,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };

  cancelSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctorId = req.params.doctorId as string;
      const slotId = req.params.slotId as string;
      const slot = await this.availabilityService.cancelSlot(doctorId, slotId, req.user!);
      res.status(200).json({
        success: true,
        message: 'Availability slot cancelled successfully',
        data: slot
      });
    } catch (error) {
      next(error);
    }
  };
}

export const availabilityController = new AvailabilityController();
