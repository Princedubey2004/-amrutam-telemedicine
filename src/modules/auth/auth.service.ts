import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import { env } from '../../config/env';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../common/errors/AppError';
import { RegisterInput, LoginInput } from './auth.validation';

export interface SafeUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile?: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string | null;
    gender?: string;
    avatarUrl?: string | null;
  } | null;
}

export interface LoginResult {
  token: string;
  user: SafeUser;
}

export class AuthService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Registers a new PATIENT user account with normalized email, hashed password, and user profile.
   */
  async register(input: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if email is already taken
    const existingUser = await this.db.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    // Determine first and last names
    let firstName = input.firstName ?? '';
    let lastName = input.lastName ?? '';

    if (input.name && !firstName) {
      const parts = input.name.trim().split(/\s+/);
      firstName = parts[0] || 'User';
      lastName = parts.slice(1).join(' ') || (input.lastName ?? '');
    }

    if (!firstName) {
      firstName = 'Patient';
    }

    // Hash password with bcrypt cost factor 10
    const passwordHash = await bcrypt.hash(input.password, 10);

    // Create user and profile in a single atomic transaction
    const user = await this.db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: Role.PATIENT,
        profile: {
          create: {
            firstName,
            lastName
          }
        }
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            gender: true,
            avatarUrl: true
          }
        }
      }
    });

    // Explicitly guarantee passwordHash is never leaked
    const { passwordHash: _removed, ...safeUser } = user as unknown as { passwordHash?: string; [key: string]: unknown };

    return safeUser as unknown as SafeUser;
  }

  /**
   * Authenticates user credentials and issues a signed JWT token.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            gender: true,
            avatarUrl: true
          }
        }
      }
    });

    // Use generic error message to prevent account enumeration
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password hash
    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Issue signed JWT token containing minimal claims
    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email
      },
      env.JWT_SECRET,
      {
        expiresIn: (env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) ?? '1d'
      }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: user.profile
      }
    };
  }

  /**
   * Retrieves the current authenticated user's safe profile.
   */
  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            dateOfBirth: true,
            gender: true,
            bloodGroup: true,
            avatarUrl: true
          }
        },
        doctor: {
          select: {
            id: true,
            licenseNumber: true,
            specialization: true,
            experienceYears: true,
            consultationFee: true,
            status: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      throw new NotFoundError('User profile not found');
    }

    return user;
  }
}

export const authService = new AuthService();
