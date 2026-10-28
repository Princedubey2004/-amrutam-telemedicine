import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from '../common/errors/AppError';
import { env } from '../config/env';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

export interface JwtTokenPayload {
  sub: string;
  role: Role;
  email: string;
  iat?: number;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

/**
 * Reusable JWT authentication middleware verifying Bearer tokens.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authentication token is missing'));
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtTokenPayload;

    if (!decoded.sub || !decoded.role || !decoded.email) {
      next(new UnauthorizedError('Invalid authentication token payload'));
      return;
    }

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Authentication token has expired'));
      return;
    }
    next(new UnauthorizedError('Invalid or malformed authentication token'));
  }
};

/**
 * Reusable role-based authorization middleware.
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('You do not have permission to perform this action'));
      return;
    }

    next();
  };
};
