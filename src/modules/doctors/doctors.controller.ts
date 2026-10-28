import { Request, Response, NextFunction } from 'express';
import { DoctorsService, doctorsService as defaultDoctorsService } from './doctors.service';
import { GetDoctorsQuery } from './doctors.validation';

export class DoctorsController {
  private doctorsService: DoctorsService;

  constructor(service: DoctorsService = defaultDoctorsService) {
    this.doctorsService = service;
  }

  createDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctor = await this.doctorsService.createDoctor(req.body);
      res.status(201).json({
        success: true,
        message: 'Doctor profile created successfully',
        data: doctor
      });
    } catch (error) {
      next(error);
    }
  };

  getPublicDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.doctorsService.getPublicDoctors(req.query as unknown as GetDoctorsQuery);
      res.status(200).json({
        success: true,
        data: result.doctors,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };

  getPublicDoctorById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctor = await this.doctorsService.getPublicDoctorById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: doctor
      });
    } catch (error) {
      next(error);
    }
  };
}

export const doctorsController = new DoctorsController();
