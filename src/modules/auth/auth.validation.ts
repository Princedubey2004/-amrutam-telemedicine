import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().optional(),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long'),
  role: z
    .enum(['PATIENT', 'DOCTOR', 'ADMIN'])
    .optional()
    .refine((val) => !val || val === Role.PATIENT, {
      message: 'Public registration is only permitted for the PATIENT role. DOCTOR and ADMIN accounts cannot be registered publicly.'
    })
    .default(Role.PATIENT)
}).refine((data) => data.name || data.firstName, {
  message: 'Either name or firstName must be provided',
  path: ['name']
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
