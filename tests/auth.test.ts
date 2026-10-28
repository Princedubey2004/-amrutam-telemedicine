import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express, { Express, Request, Response } from 'express';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../src/middleware/auth.middleware';

describe('Authentication Module Unit & API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a new PATIENT user and return safe user data without secrets', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const mockCreatedUser = {
        id: 'patient-uuid-1234',
        email: 'priya.sharma@example.com',
        passwordHash: '$2b$10$hashedsecretshouldneverbereturned',
        role: Role.PATIENT,
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date('2026-10-28T12:00:00.000Z'),
        updatedAt: new Date('2026-10-28T12:00:00.000Z'),
        profile: {
          id: 'profile-uuid-1234',
          userId: 'patient-uuid-1234',
          firstName: 'Priya',
          lastName: 'Sharma',
          phoneNumber: null,
          dateOfBirth: null,
          gender: 'UNDISCLOSED',
          bloodGroup: null,
          avatarUrl: null,
          createdAt: new Date('2026-10-28T12:00:00.000Z'),
          updatedAt: new Date('2026-10-28T12:00:00.000Z')
        }
      };

      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockCreatedUser as never);

      const payload = {
        name: 'Priya Sharma',
        email: 'Priya.Sharma@Example.COM ', // Tests normalization
        password: 'SecurePassword123!'
      };

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.data).toHaveProperty('id', 'patient-uuid-1234');
      expect(res.body.data).toHaveProperty('email', 'priya.sharma@example.com');
      expect(res.body.data).toHaveProperty('role', 'PATIENT');
      expect(res.body.data.profile).toEqual(
        expect.objectContaining({
          firstName: 'Priya',
          lastName: 'Sharma'
        })
      );
      // Guarantee security: passwordHash must NOT be returned
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('hashedsecretshouldneverbereturned');
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const existingUser = {
        id: 'existing-id',
        email: 'duplicate@example.com',
        passwordHash: 'hash',
        role: Role.PATIENT,
        isActive: true,
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(existingUser as never);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Duplicate User',
          email: 'duplicate@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already exists');
    });

    it('should reject invalid registration input (short password, invalid email, missing name)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email-address',
          password: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error).toHaveProperty('details');
    });

    it('should prevent public registration with ADMIN role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Attacker Admin',
          email: 'attacker.admin@example.com',
          password: 'Password123!',
          role: 'ADMIN'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
      expect(JSON.stringify(res.body)).toContain('Public registration is only permitted for the PATIENT role');
    });

    it('should prevent public registration with DOCTOR role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Attacker Doctor',
          email: 'attacker.doc@example.com',
          password: 'Password123!',
          role: 'DOCTOR'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Validation failed');
      expect(JSON.stringify(res.body)).toContain('Public registration is only permitted for the PATIENT role');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const rawPassword = 'ValidPassword123!';
    const passwordHash = bcrypt.hashSync(rawPassword, 10);

    const mockDbUser = {
      id: 'user-uuid-login-123',
      email: 'verified.user@example.com',
      passwordHash,
      role: Role.PATIENT,
      isActive: true,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      profile: {
        id: 'profile-login-123',
        firstName: 'Verified',
        lastName: 'Patient',
        avatarUrl: null
      }
    };

    it('should successfully log in with valid credentials and return a signed JWT', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockDbUser as never);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: ' verified.user@example.com ',
          password: rawPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toEqual(
        expect.objectContaining({
          id: 'user-uuid-login-123',
          email: 'verified.user@example.com',
          role: 'PATIENT'
        })
      );
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      // Verify token signature and claims
      const decoded = jwt.verify(res.body.data.token, env.JWT_SECRET) as {
        sub: string;
        role: string;
        email: string;
      };
      expect(decoded.sub).toBe('user-uuid-login-123');
      expect(decoded.role).toBe('PATIENT');
      expect(decoded.email).toBe('verified.user@example.com');
    });

    it('should return 401 with generic error message for incorrect password', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockDbUser as never);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'verified.user@example.com',
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should return 401 with generic error message for non-existent email', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 Unauthorized when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('token is missing');
    });

    it('should return 401 Unauthorized when JWT token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer this.is.an.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid or malformed authentication token');
    });

    it('should return 200 OK with authenticated user profile for a valid JWT', async () => {
      const userId = 'user-auth-me-789';
      const token = jwt.sign(
        { sub: userId, role: Role.PATIENT, email: 'patient.me@example.com' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const mockUserProfile = {
        id: userId,
        email: 'patient.me@example.com',
        role: Role.PATIENT,
        isActive: true,
        isEmailVerified: true,
        createdAt: new Date('2026-10-28T10:00:00.000Z'),
        updatedAt: new Date('2026-10-28T10:00:00.000Z'),
        profile: {
          id: 'profile-me-789',
          firstName: 'Siddharth',
          lastName: 'Mehta',
          phoneNumber: '+919876543210',
          gender: 'MALE',
          bloodGroup: 'O+',
          avatarUrl: 'https://example.com/avatar.jpg'
        },
        doctor: null
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUserProfile as never);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: userId,
          email: 'patient.me@example.com',
          role: 'PATIENT'
        })
      );
      expect(res.body.data.profile).toEqual(
        expect.objectContaining({
          firstName: 'Siddharth',
          lastName: 'Mehta'
        })
      );
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });
  });

  describe('Role-Based Authorization Middleware (authorize)', () => {
    let testApp: Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());

      // Protected admin-only test route
      testApp.get(
        '/admin-only',
        authenticate,
        authorize(Role.ADMIN),
        (_req: Request, res: Response) => {
          res.status(200).json({ success: true, message: 'Welcome Admin' });
        }
      );

      // Centralized error handling
      testApp.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: unknown) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
          success: false,
          error: { message: err.message }
        });
      });
    });

    it('should return 403 Forbidden when an authenticated PATIENT attempts to access an ADMIN route', async () => {
      const patientToken = jwt.sign(
        { sub: 'patient-id', role: Role.PATIENT, email: 'patient@example.com' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(testApp)
        .get('/admin-only')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('permission');
    });

    it('should return 200 OK when an authenticated ADMIN accesses the ADMIN route', async () => {
      const adminToken = jwt.sign(
        { sub: 'admin-id', role: Role.ADMIN, email: 'admin@example.com' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(testApp)
        .get('/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Welcome Admin');
    });
  });
});
