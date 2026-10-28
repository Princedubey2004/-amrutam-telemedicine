import {
  PrismaClient,
  Role,
  DoctorStatus,
  ConsultationStatus,
  PaymentStatus,
  Prisma
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database';
import { TrendsQuery, DoctorAnalyticsQuery } from './analytics.validation';

export class AnalyticsService {
  private db: PrismaClient;

  constructor(databaseClient: PrismaClient = defaultPrisma) {
    this.db = databaseClient;
  }

  /**
   * Retrieves high-level administrative platform KPI summary.
   * Uses database-level aggregations and counts without exposing patient medical data.
   */
  async getDashboardSummary() {
    const now = new Date();

    const [
      totalUsers,
      activePatients,
      verifiedDoctors,
      totalConsultations,
      consultationsByStatusGroup,
      paymentsByStatusGroup,
      completedPaymentAggregate,
      upcomingConsultations
    ] = await Promise.all([
      // 1. Total registered users
      this.db.user.count(),

      // 2. Active patients
      this.db.user.count({
        where: { role: Role.PATIENT, isActive: true }
      }),

      // 3. Verified doctors
      this.db.doctor.count({
        where: { status: DoctorStatus.VERIFIED }
      }),

      // 4. Total consultations
      this.db.consultation.count(),

      // 5. Consultations grouped by status
      this.db.consultation.groupBy({
        by: ['status'],
        _count: { id: true }
      }),

      // 6. Payments grouped by status
      this.db.payment.groupBy({
        by: ['status'],
        _count: { id: true }
      }),

      // 7. Total completed payment revenue
      this.db.payment.aggregate({
        where: { status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
        _count: { id: true }
      }),

      // 8. Upcoming scheduled consultations
      this.db.consultation.count({
        where: {
          status: { in: [ConsultationStatus.REQUESTED, ConsultationStatus.SCHEDULED] },
          slot: { startTime: { gt: now } }
        }
      })
    ]);

    // Format consultation counts by status
    const consultationsByStatus: Record<string, number> = {};
    for (const group of consultationsByStatusGroup) {
      consultationsByStatus[group.status] = group._count.id;
    }

    // Format payment counts by status
    const paymentsByStatus: Record<string, number> = {};
    let totalTransactions = 0;
    for (const group of paymentsByStatusGroup) {
      paymentsByStatus[group.status] = group._count.id;
      totalTransactions += group._count.id;
    }

    const totalRevenue = completedPaymentAggregate._sum.amount
      ? Number(completedPaymentAggregate._sum.amount)
      : 0;

    return {
      users: {
        total: totalUsers,
        activePatients,
        verifiedDoctors
      },
      consultations: {
        total: totalConsultations,
        upcoming: upcomingConsultations,
        byStatus: consultationsByStatus
      },
      payments: {
        totalTransactions,
        byStatus: paymentsByStatus,
        revenue: {
          totalCompletedAmount: totalRevenue,
          currency: 'INR',
          completedCount: completedPaymentAggregate._count.id
        }
      }
    };
  }

  /**
   * Retrieves bounded time-series trends for consultations and revenue.
   */
  async getTrends(query: TrendsQuery) {
    const endDate = query.endDate || new Date();
    const startDate =
      query.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default past 30 days
    const interval = query.interval;

    // Fetch consultation timestamps and statuses within the bounded date window
    const [consultations, payments] = await Promise.all([
      this.db.consultation.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          createdAt: true,
          status: true
        }
      }),
      this.db.payment.findMany({
        where: {
          status: PaymentStatus.COMPLETED,
          paidAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          paidAt: true,
          amount: true
        }
      })
    ]);

    // Format date key based on interval
    const formatBucketKey = (date: Date): string => {
      const iso = date.toISOString();
      if (interval === 'month') {
        return iso.substring(0, 7); // YYYY-MM
      }
      return iso.substring(0, 10); // YYYY-MM-DD
    };

    const buckets: Record<
      string,
      {
        date: string;
        consultationsTotal: number;
        consultationsCompleted: number;
        consultationsCancelled: number;
        revenueAmount: number;
      }
    > = {};

    for (const c of consultations) {
      const key = formatBucketKey(c.createdAt);
      if (!buckets[key]) {
        buckets[key] = {
          date: key,
          consultationsTotal: 0,
          consultationsCompleted: 0,
          consultationsCancelled: 0,
          revenueAmount: 0
        };
      }
      buckets[key].consultationsTotal += 1;
      if (c.status === ConsultationStatus.COMPLETED) {
        buckets[key].consultationsCompleted += 1;
      } else if (c.status === ConsultationStatus.CANCELLED) {
        buckets[key].consultationsCancelled += 1;
      }
    }

    for (const p of payments) {
      const paidDate = p.paidAt || new Date();
      const key = formatBucketKey(paidDate);
      if (!buckets[key]) {
        buckets[key] = {
          date: key,
          consultationsTotal: 0,
          consultationsCompleted: 0,
          consultationsCancelled: 0,
          revenueAmount: 0
        };
      }
      buckets[key].revenueAmount += Number(p.amount);
    }

    // Sort bucket entries chronologically
    const sortedTrends = Object.values(buckets).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      interval,
      currency: 'INR',
      data: sortedTrends
    };
  }

  /**
   * Retrieves aggregated doctor performance metrics without exposing patient medical details.
   */
  async getDoctorPerformance(query: DoctorAnalyticsQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.DoctorWhereInput = {};
    if (query.doctorId) {
      where.id = query.doctorId;
    }

    const [totalDoctors, doctors] = await Promise.all([
      this.db.doctor.count({ where }),
      this.db.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          licenseNumber: true,
          specialization: true,
          status: true,
          consultationFee: true,
          user: {
            select: {
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          consultations: {
            select: {
              id: true,
              status: true,
              fee: true,
              payments: {
                where: { status: PaymentStatus.COMPLETED },
                select: { amount: true }
              }
            }
          }
        }
      })
    ]);

    const formattedDoctors = doctors.map((doc) => {
      let completedCount = 0;
      let cancelledCount = 0;
      let totalEarnedRevenue = 0;

      for (const c of doc.consultations) {
        if (c.status === ConsultationStatus.COMPLETED) {
          completedCount += 1;
        } else if (c.status === ConsultationStatus.CANCELLED) {
          cancelledCount += 1;
        }

        for (const p of c.payments) {
          totalEarnedRevenue += Number(p.amount);
        }
      }

      return {
        id: doc.id,
        doctorName: doc.user.profile
          ? `Dr. ${doc.user.profile.firstName} ${doc.user.profile.lastName}`
          : 'Dr. Physician',
        email: doc.user.email,
        specialization: doc.specialization,
        licenseNumber: doc.licenseNumber,
        status: doc.status,
        consultationFee: Number(doc.consultationFee),
        metrics: {
          totalConsultations: doc.consultations.length,
          completedConsultations: completedCount,
          cancelledConsultations: cancelledCount,
          totalRevenueGenerated: totalEarnedRevenue,
          currency: 'INR'
        }
      };
    });

    return {
      doctors: formattedDoctors,
      meta: {
        page,
        limit,
        total: totalDoctors,
        totalPages: Math.ceil(totalDoctors / limit)
      }
    };
  }
}

export const analyticsService = new AnalyticsService();
