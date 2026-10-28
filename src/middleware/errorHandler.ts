import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../common/errors/AppError';
import { env } from '../config/env';

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        details: err.details,
        ...(env.NODE_ENV === 'development' && { stack: err.stack })
      }
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: err.flatten(),
        ...(env.NODE_ENV === 'development' && { stack: err.stack })
      }
    });
    return;
  }

  // Handle generic / unexpected internal errors
  const isDevelopment = env.NODE_ENV === 'development';
  console.error('Unhandled application error:', err);

  res.status(500).json({
    success: false,
    error: {
      message: isDevelopment ? err.message : 'Internal Server Error',
      ...(isDevelopment && { stack: err.stack })
    }
  });
};
