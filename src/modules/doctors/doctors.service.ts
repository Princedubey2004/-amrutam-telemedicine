import { PrismaClient, DoctorStatus, Role, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import { NotFoundError, BadRequestError, ConflictError } from '../../common/errors/AppError';
import { CreateDoctorInput, GetDoctorsQuery } from './doctors.validation';

export class DoctorsService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Creates a new doctor profile for an existing user account with the DOCTOR role.
   */
  async createDoctor(input: CreateDoctorInput) {
    // 1. Verify target user exists and holds DOCTOR role
    const user = await this.db.user.findUnique({
      where: { id: input.userId }
    });

    if (!user) {
      throw new NotFoundError('Target user not found');
    }

    if (user.role !== Role.DOCTOR) {
      throw new BadRequestError('Target user does not have the DOCTOR role');
    }

    // 2. Ensure user doesn't already have a doctor profile
    const existingDoctorForUser = await this.db.doctor.findUnique({
      where: { userId: input.userId }
    });

    if (existingDoctorForUser) {
      throw new ConflictError('A doctor profile already exists for this user account');
    }

    // 3. Prevent duplicate medical license numbers
    const existingLicense = await this.db.doctor.findUnique({
      where: { licenseNumber: input.licenseNumber }
    });

    if (existingLicense) {
      throw new ConflictError('A doctor with this license number already exists');
    }

    // 4. Create doctor record
    return this.db.doctor.create({
      data: {
        userId: input.userId,
        licenseNumber: input.licenseNumber,
        specialization: input.specialization,
        experienceYears: input.experienceYears,
        qualifications: input.qualifications,
        bio: input.bio,
        consultationFee: input.consultationFee,
        status: input.status as DoctorStatus
      },
      select: {
        id: true,
        userId: true,
        licenseNumber: true,
        specialization: true,
        experienceYears: true,
        qualifications: true,
        bio: true,
        consultationFee: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Lists verified and active doctors with pagination and filters.
   */
  async getPublicDoctors(query: GetDoctorsQuery) {
    const where: Prisma.DoctorWhereInput = {
      status: DoctorStatus.VERIFIED,
      user: {
        isActive: true
      }
    };

    if (query.specialization) {
      where.specialization = {
        contains: query.specialization,
        mode: 'insensitive'
      };
    }

    if (query.minFee !== undefined || query.maxFee !== undefined) {
      where.consultationFee = {};
      if (query.minFee !== undefined) {
        where.consultationFee.gte = query.minFee;
      }
      if (query.maxFee !== undefined) {
        where.consultationFee.lte = query.maxFee;
      }
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [total, doctors] = await Promise.all([
      this.db.doctor.count({ where }),
      this.db.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          specialization: true,
          experienceYears: true,
          qualifications: true,
          bio: true,
          consultationFee: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  avatarUrl: true
                }
              }
            }
          }
        }
      })
    ]);

    return {
      doctors,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves a verified doctor profile by ID for public view.
   */
  async getPublicDoctorById(id: string) {
    const doctor = await this.db.doctor.findFirst({
      where: {
        id,
        status: DoctorStatus.VERIFIED,
        user: {
          isActive: true
        }
      },
      select: {
        id: true,
        specialization: true,
        experienceYears: true,
        qualifications: true,
        bio: true,
        consultationFee: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    if (!doctor) {
      throw new NotFoundError('Doctor profile not found');
    }

    return doctor;
  }
}

export const doctorsService = new DoctorsService();
