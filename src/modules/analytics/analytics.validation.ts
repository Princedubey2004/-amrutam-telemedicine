import { z } from 'zod';

export const trendsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  interval: z.enum(['day', 'month']).default('day')
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
  path: ['startDate']
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const diffMs = data.endDate.getTime() - data.startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (data.interval === 'day' && diffDays > 90) {
      return false;
    }
    if (data.interval === 'month' && diffDays > 365) {
      return false;
    }
  }
  return true;
}, {
  message: 'Date range cannot exceed 90 days for daily interval or 365 days for monthly interval',
  path: ['endDate']
});

export const doctorAnalyticsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  doctorId: z.string().uuid('Invalid doctor ID format').optional()
});

export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
export type DoctorAnalyticsQuery = z.infer<typeof doctorAnalyticsQuerySchema>;
