import { Router } from 'express';
import { authController } from './auth.controller';
import { registerSchema, loginSchema } from './auth.validation';
import { validateRequest, authenticate } from '../../middleware';

export const authRouter = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Public registration for PATIENT role
 * @access  Public
 */
authRouter.post('/register', validateRequest(registerSchema), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user credentials and obtain JWT
 * @access  Public
 */
authRouter.post('/login', validateRequest(loginSchema), authController.login);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Retrieve profile of the currently authenticated user
 * @access  Private (Requires valid JWT)
 */
authRouter.get('/me', authenticate, authController.getMe);
