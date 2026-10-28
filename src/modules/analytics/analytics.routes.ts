import { Router } from 'express';
import { Role } from '@prisma/client';
import { analyticsController } from './analytics.controller';
import {
  trendsQuerySchema,
  doctorAnalyticsQuerySchema
} from './analytics.validation';
import {
  authenticate,
  authorize,
  validateQuery
} from '../../middleware';

export const analyticsRouter = Router();

/**
 * @route   GET /api/v1/admin/analytics/summary
 * @desc    Get high-level platform KPI summary metrics
 * @access  Protected (ADMIN only)
 */
analyticsRouter.get(
  '/summary',
  authenticate,
  authorize(Role.ADMIN),
  analyticsController.getDashboardSummary
);

/**
 * @route   GET /api/v1/admin/analytics/trends
 * @desc    Get time-series trends for consultations and revenue
 * @access  Protected (ADMIN only)
 */
analyticsRouter.get(
  '/trends',
  authenticate,
  authorize(Role.ADMIN),
  validateQuery(trendsQuerySchema),
  analyticsController.getTrends
);

/**
 * @route   GET /api/v1/admin/analytics/doctors
 * @desc    Get aggregated doctor performance statistics
 * @access  Protected (ADMIN only)
 */
analyticsRouter.get(
  '/doctors',
  authenticate,
  authorize(Role.ADMIN),
  validateQuery(doctorAnalyticsQuerySchema),
  analyticsController.getDoctorPerformance
);
