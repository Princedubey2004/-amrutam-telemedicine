import { Request, Response, NextFunction } from 'express';
import {
  ConsultationsService,
  consultationsService as defaultConsultationsService
} from './consultations.service';
import { GetConsultationsQuery } from './consultations.validation';

export class ConsultationsController {
  private consultationsService: ConsultationsService;

  constructor(service: ConsultationsService = defaultConsultationsService) {
    this.consultationsService = service;
  }

  getConsultations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.consultationsService.getConsultations(
        req.user!,
        req.query as unknown as GetConsultationsQuery
      );

      res.status(200).json({
        success: true,
        data: result.consultations,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };

  getConsultationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const consultation = await this.consultationsService.getConsultationById(
        req.params.id as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  };

  startConsultation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const consultation = await this.consultationsService.startConsultation(
        req.params.id as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        message: 'Consultation started successfully',
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  };

  completeConsultation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const consultation = await this.consultationsService.completeConsultation(
        req.params.id as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        message: 'Consultation completed successfully',
        data: consultation
      });
    } catch (error) {
      next(error);
    }
  };

  createPrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prescription = await this.consultationsService.createPrescription(
        req.params.id as string,
        req.body,
        req.user!
      );

      res.status(201).json({
        success: true,
        message: 'Prescription issued successfully',
        data: prescription
      });
    } catch (error) {
      next(error);
    }
  };

  getPrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prescription = await this.consultationsService.getPrescription(
        req.params.id as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        data: prescription
      });
    } catch (error) {
      next(error);
    }
  };
}

export const consultationsController = new ConsultationsController();
