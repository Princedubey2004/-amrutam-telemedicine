import { z } from 'zod';
import { ConsultationStatus } from '@prisma/client';

export const getConsultationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(ConsultationStatus).optional()
});

export const consultationIdParamSchema = z.object({
  id: z.string().uuid('Invalid consultation ID format')
});

export const createPrescriptionItemSchema = z.object({
  medicineName: z
    .string({ required_error: 'Medicine name is required' })
    .trim()
    .min(1, 'Medicine name cannot be empty')
    .max(200, 'Medicine name cannot exceed 200 characters'),
  dosage: z
    .string({ required_error: 'Dosage is required' })
    .trim()
    .min(1, 'Dosage cannot be empty')
    .max(100, 'Dosage cannot exceed 100 characters'),
  frequency: z
    .string({ required_error: 'Frequency is required' })
    .trim()
    .min(1, 'Frequency cannot be empty')
    .max(100, 'Frequency cannot exceed 100 characters'),
  durationDays: z
    .coerce
    .number({ required_error: 'Duration in days is required' })
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 day'),
  instructions: z
    .string()
    .trim()
    .max(1000, 'Instructions cannot exceed 1000 characters')
    .optional()
});

export const createPrescriptionSchema = z.object({
  diagnosis: z
    .string({ required_error: 'Diagnosis is required' })
    .trim()
    .min(2, 'Diagnosis must be at least 2 characters')
    .max(1000, 'Diagnosis cannot exceed 1000 characters'),
  instructions: z
    .string()
    .trim()
    .max(2000, 'Instructions cannot exceed 2000 characters')
    .optional(),
  items: z
    .array(createPrescriptionItemSchema, {
      required_error: 'Prescription items are required'
    })
    .min(1, 'Prescription must contain at least one medicine item')
});

export type GetConsultationsQuery = z.infer<typeof getConsultationsQuerySchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type CreatePrescriptionItemInput = z.infer<typeof createPrescriptionItemSchema>;
