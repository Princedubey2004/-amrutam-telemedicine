import { z } from 'zod';
import { ConsultationStatus } from '@prisma/client';

export const createBookingSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID format'),
  symptomsSummary: z
    .string()
    .trim()
    .max(1000, 'Symptoms summary cannot exceed 1000 characters')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes cannot exceed 2000 characters')
    .optional()
});

export const getBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(ConsultationStatus).optional()
});

export const bookingIdParamSchema = z.object({
  id: z.string().uuid('Invalid booking ID format')
});

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Cancellation reason cannot exceed 500 characters')
    .optional()
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type GetBookingsQuery = z.infer<typeof getBookingsQuerySchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
