import { z } from 'zod';

export const createSlotSchema = z.object({
  startTime: z.coerce.date({ required_error: 'startTime is required' }),
  endTime: z.coerce.date({ required_error: 'endTime is required' })
}).refine((data) => data.startTime < data.endTime, {
  message: 'startTime must be strictly before endTime',
  path: ['endTime']
}).refine((data) => data.startTime.getTime() > Date.now(), {
  message: 'startTime cannot be in the past',
  path: ['startTime']
}).refine((data) => {
  const durationMs = data.endTime.getTime() - data.startTime.getTime();
  const durationMinutes = durationMs / (1000 * 60);
  return durationMinutes >= 15 && durationMinutes <= 240;
}, {
  message: 'Slot duration must be between 15 minutes and 4 hours (240 minutes)',
  path: ['endTime']
}).refine((data) => {
  const maxAdvanceMs = 90 * 24 * 60 * 60 * 1000; // 90 days
  return data.startTime.getTime() <= Date.now() + maxAdvanceMs;
}, {
  message: 'Slot cannot be scheduled more than 90 days in advance',
  path: ['startTime']
});

export const getAvailabilityQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'startDate cannot be after endDate',
  path: ['startDate']
});

export const availabilityDoctorParamSchema = z.object({
  doctorId: z.string().uuid('Invalid doctor ID format')
});

export const availabilitySlotParamSchema = z.object({
  doctorId: z.string().uuid('Invalid doctor ID format'),
  slotId: z.string().uuid('Invalid slot ID format')
});

export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type GetAvailabilityQuery = z.infer<typeof getAvailabilityQuerySchema>;
