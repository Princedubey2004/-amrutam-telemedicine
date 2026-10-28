import { PrismaClient, Role, DoctorStatus, SlotStatus, Gender } from '@prisma/client';

const prisma = new PrismaClient();

// Safe deterministic bcrypt hash for 'DevSecurePassword123!' (cost 10)
const DEV_PASSWORD_HASH = '$2b$10$wT0r6e14OQoXU2xsmz3l7e0Ww2eA6i/Vw1R1w8A9vM4Qf7e2A2LWy';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script is strictly forbidden from running in production.');
  }

  console.log('🌱 Starting safe development database seed...');

  // 1. Seed Synthetic Administrator
  const admin = await prisma.user.upsert({
    where: { email: 'admin.amrutam@example.com' },
    update: {},
    create: {
      email: 'admin.amrutam@example.com',
      passwordHash: DEV_PASSWORD_HASH,
      role: Role.ADMIN,
      isEmailVerified: true,
      profile: {
        create: {
          firstName: 'System',
          lastName: 'Administrator',
          gender: Gender.UNDISCLOSED,
          phoneNumber: '+919999900001'
        }
      }
    }
  });
  console.log(`   Created/verified Admin user: ${admin.email}`);

  // 2. Seed Synthetic Doctor User & Doctor Profile
  const doctorUser = await prisma.user.upsert({
    where: { email: 'dr.sharma.ayurveda@example.com' },
    update: {},
    create: {
      email: 'dr.sharma.ayurveda@example.com',
      passwordHash: DEV_PASSWORD_HASH,
      role: Role.DOCTOR,
      isEmailVerified: true,
      profile: {
        create: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          gender: Gender.FEMALE,
          phoneNumber: '+919876543210'
        }
      },
      doctor: {
        create: {
          licenseNumber: 'AYU-DL-2024-00876',
          specialization: 'Ayurvedic Medicine & Panchakarma',
          experienceYears: 12,
          qualifications: ['BAMS', 'MD (Ayurveda)'],
          bio: 'Specialist in chronic holistic health management, Nadi Pariksha, and lifestyle restoration.',
          consultationFee: 750.00,
          status: DoctorStatus.VERIFIED
        }
      }
    },
    include: {
      doctor: true
    }
  });

  const doctorProfile = doctorUser.doctor;
  if (!doctorProfile) {
    throw new Error('Failed to create or retrieve doctor profile');
  }
  console.log(`   Created/verified Doctor user: ${doctorUser.email} (ID: ${doctorProfile.id})`);

  // 3. Seed Synthetic Patient
  const patient = await prisma.user.upsert({
    where: { email: 'patient.test@example.com' },
    update: {},
    create: {
      email: 'patient.test@example.com',
      passwordHash: DEV_PASSWORD_HASH,
      role: Role.PATIENT,
      isEmailVerified: true,
      profile: {
        create: {
          firstName: 'Rahul',
          lastName: 'Verma',
          gender: Gender.MALE,
          bloodGroup: 'B+',
          phoneNumber: '+919811122233'
        }
      }
    }
  });
  console.log(`   Created/verified Patient user: ${patient.email}`);

  // 4. Seed Sample Availability Slots for Doctor
  // Create slots for tomorrow at 10:00, 11:00, 14:00, and 15:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setMinutes(0, 0, 0);

  const slotHours = [10, 11, 14, 15];
  for (const hour of slotHours) {
    const startTime = new Date(tomorrow);
    startTime.setHours(hour);

    const endTime = new Date(startTime);
    endTime.setMinutes(45); // 45-minute consultation slot

    await prisma.availabilitySlot.upsert({
      where: {
        doctorId_startTime: {
          doctorId: doctorProfile.id,
          startTime
        }
      },
      update: {},
      create: {
        doctorId: doctorProfile.id,
        startTime,
        endTime,
        status: SlotStatus.AVAILABLE
      }
    });
  }
  console.log(`   Created ${slotHours.length} sample availability slots for Dr. Ananya Sharma`);

  console.log('✅ Safe development seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
