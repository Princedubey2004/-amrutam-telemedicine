import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './modules/auth';
import { doctorsRouter } from './modules/doctors';
import { bookingsRouter } from './modules/bookings';
import { consultationsRouter } from './modules/consultations';
import { paymentsRouter } from './modules/payments';
import { analyticsRouter } from './modules/analytics';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

export const createApp = (): Express => {
  const app = express();

  // Security and utilities middleware
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
      credentials: true
    })
  );
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Health and readiness routes
  app.use('/health', healthRouter);

  // Authentication API routes
  app.use('/api/v1/auth', authRouter);

  // Doctor management and availability routes
  app.use('/api/v1/doctors', doctorsRouter);

  // Appointment booking routes
  app.use('/api/v1/bookings', bookingsRouter);

  // Consultation and prescription routes
  app.use('/api/v1/consultations', consultationsRouter);

  // Payment lifecycle routes
  app.use('/api/v1/payments', paymentsRouter);

  // Administrative analytics routes
  app.use('/api/v1/admin/analytics', analyticsRouter);

  // Catch-all for undefined routes
  app.use(notFoundHandler);

  // Centralized error handling
  app.use(errorHandler);

  return app;
};

export const app = createApp();
