import { Request, Response, NextFunction } from 'express';
import {
  AnalyticsService,
  analyticsService as defaultAnalyticsService
} from './analytics.service';
import { TrendsQuery, DoctorAnalyticsQuery } from './analytics.validation';

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor(service: AnalyticsService = defaultAnalyticsService) {
    this.analyticsService = service;
  }

  getDashboardSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.analyticsService.getDashboardSummary();
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  };

  getTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const trends = await this.analyticsService.getTrends(
        req.query as unknown as TrendsQuery
      );
      res.status(200).json({
        success: true,
        data: trends
      });
    } catch (error) {
      next(error);
    }
  };

  getDoctorPerformance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.analyticsService.getDoctorPerformance(
        req.query as unknown as DoctorAnalyticsQuery
      );
      res.status(200).json({
        success: true,
        data: result.doctors,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };
}

export const analyticsController = new AnalyticsController();
