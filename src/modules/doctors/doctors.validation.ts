import { z } from 'zod';

export const createDoctorSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  licenseNumber: z
    .string({ required_error: 'License number is required' })
    .min(3, 'License number must be at least 3 characters long')
    .trim()
    .toUpperCase(),
  specialization: z
    .string({ required_error: 'Specialization is required' })
    .min(2, 'Specialization must be at least 2 characters long')
    .trim(),
  experienceYears: z
    .coerce
    .number()
    .int('Experience years must be an integer')
    .min(0, 'Experience years cannot be negative')
    .default(0),
  qualifications: z.array(z.string().trim()).default([]),
  bio: z.string().max(2000, 'Bio cannot exceed 2000 characters').optional(),
  consultationFee: z
    .coerce
    .number({ required_error: 'Consultation fee is required' })
    .min(0, 'Consultation fee cannot be negative'),
  status: z
    .enum(['PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'INACTIVE'])
    .optional()
    .default('VERIFIED')
});

export const getDoctorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  specialization: z.string().trim().optional(),
  minFee: z.coerce.number().min(0).optional(),
  maxFee: z.coerce.number().min(0).optional()
}).refine((data) => {
  if (data.minFee !== undefined && data.maxFee !== undefined) {
    return data.minFee <= data.maxFee;
  }
  return true;
}, {
  message: 'minFee cannot be greater than maxFee',
  path: ['minFee']
});

export const doctorIdParamSchema = z.object({
  id: z.string().uuid('Invalid doctor ID format')
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type GetDoctorsQuery = z.infer<typeof getDoctorsQuerySchema>;
