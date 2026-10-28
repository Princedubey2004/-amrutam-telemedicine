import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Prisma Schema Data Model & Specification Tests (Offline / In-Memory DMMF)', () => {
  const models = Prisma.dmmf.datamodel.models;
  const enums = Prisma.dmmf.datamodel.enums;

  const getModel = (name: string) => {
    const model = models.find((m) => m.name === name);
    if (!model) throw new Error(`Model ${name} not found in Prisma DMMF`);
    return model;
  };

  const getEnum = (name: string) => {
    const enumDef = enums.find((e) => e.name === name);
    if (!enumDef) throw new Error(`Enum ${name} not found in Prisma DMMF`);
    return enumDef;
  };

  describe('1. Model Inventory and Primary Keys', () => {
    const expectedModels = [
      'User',
      'Profile',
      'Doctor',
      'AvailabilitySlot',
      'Consultation',
      'Prescription',
      'PrescriptionItem',
      'Payment',
      'AuditLog',
      'RefreshToken',
      'IdempotencyRecord',
      'UserMfa',
      'OutboxEvent'
    ];

    it.each(expectedModels)('should define model %s with a primary key', (modelName) => {
      const model = getModel(modelName);
      expect(model).toBeDefined();

      const idField = model.fields.find((f) => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField?.isId).toBe(true);
      expect(idField?.type).toBe('String');
    });
  });

  describe('2. Unique Constraints & Identifiers', () => {
    it('User model should enforce unique constraint on email', () => {
      const userModel = getModel('User');
      const emailField = userModel.fields.find((f) => f.name === 'email');
      expect(emailField).toBeDefined();
      expect(emailField?.isUnique).toBe(true);
    });

    it('Doctor model should enforce unique licenseNumber and userId', () => {
      const doctorModel = getModel('Doctor');
      const licenseField = doctorModel.fields.find((f) => f.name === 'licenseNumber');
      const userIdField = doctorModel.fields.find((f) => f.name === 'userId');

      expect(licenseField?.isUnique).toBe(true);
      expect(userIdField?.isUnique).toBe(true);
    });

    it('AvailabilitySlot model should enforce unique [doctorId, startTime]', () => {
      const slotModel = getModel('AvailabilitySlot');
      const hasUniqueCompound = slotModel.uniqueFields.some(
        (fields) => fields.includes('doctorId') && fields.includes('startTime')
      );
      expect(hasUniqueCompound).toBe(true);
    });

    it('AvailabilitySlot should have a 1-to-many relationship with Consultation (allowing history and reuse)', () => {
      const slotModel = getModel('AvailabilitySlot');
      const consultationsField = slotModel.fields.find((f) => f.name === 'consultations');
      expect(consultationsField).toBeDefined();
      expect(consultationsField?.isList).toBe(true);
      expect(consultationsField?.type).toBe('Consultation');
    });

    it('IdempotencyRecord model should enforce compound unique constraint on [userId, key]', () => {
      const idempotencyModel = getModel('IdempotencyRecord');
      const hasUserKeyCompound = idempotencyModel.uniqueFields.some(
        (fields) => fields.includes('userId') && fields.includes('key')
      );
      expect(hasUserKeyCompound).toBe(true);
    });

    it('Consultation model should enforce unique consultationNumber', () => {
      const consultationModel = getModel('Consultation');
      const numberField = consultationModel.fields.find((f) => f.name === 'consultationNumber');
      expect(numberField?.isUnique).toBe(true);
    });

    it('Prescription model should enforce unique prescriptionNumber', () => {
      const rxModel = getModel('Prescription');
      const numberField = rxModel.fields.find((f) => f.name === 'prescriptionNumber');
      expect(numberField?.isUnique).toBe(true);
    });

    it('Payment model should enforce unique transactionId', () => {
      const paymentModel = getModel('Payment');
      const txField = paymentModel.fields.find((f) => f.name === 'transactionId');
      expect(txField?.isUnique).toBe(true);
    });

    it('UserMfa model should enforce unique userId', () => {
      const mfaModel = getModel('UserMfa');
      const userField = mfaModel.fields.find((f) => f.name === 'userId');
      expect(userField?.isUnique).toBe(true);
    });

    it('RefreshToken model should enforce unique tokenHash', () => {
      const rtModel = getModel('RefreshToken');
      const tokenHashField = rtModel.fields.find((f) => f.name === 'tokenHash');
      expect(tokenHashField?.isUnique).toBe(true);
    });
  });

  describe('3. Referential Integrity and Deletion Safety', () => {
    it('Consultation should RESTRICT deletion of Patient, Doctor, and AvailabilitySlot', () => {
      const consultationModel = getModel('Consultation');

      const patientRelation = consultationModel.fields.find((f) => f.name === 'patient');
      const doctorRelation = consultationModel.fields.find((f) => f.name === 'doctor');
      const slotRelation = consultationModel.fields.find((f) => f.name === 'slot');

      expect(patientRelation?.relationOnDelete).toBe('Restrict');
      expect(doctorRelation?.relationOnDelete).toBe('Restrict');
      expect(slotRelation?.relationOnDelete).toBe('Restrict');
    });

    it('Prescription should RESTRICT deletion of Consultation', () => {
      const prescriptionModel = getModel('Prescription');
      const consultationRelation = prescriptionModel.fields.find(
        (f) => f.name === 'consultation'
      );
      expect(consultationRelation?.relationOnDelete).toBe('Restrict');
    });

    it('Payment should RESTRICT deletion of Consultation', () => {
      const paymentModel = getModel('Payment');
      const consultationRelation = paymentModel.fields.find((f) => f.name === 'consultation');
      expect(consultationRelation?.relationOnDelete).toBe('Restrict');
    });

    it('Doctor should RESTRICT deletion of User', () => {
      const doctorModel = getModel('Doctor');
      const userRelation = doctorModel.fields.find((f) => f.name === 'user');
      expect(userRelation?.relationOnDelete).toBe('Restrict');
    });

    it('AuditLog should SET NULL if Actor User is removed, preserving audit history', () => {
      const auditModel = getModel('AuditLog');
      const actorRelation = auditModel.fields.find((f) => f.name === 'actor');
      expect(actorRelation?.relationOnDelete).toBe('SetNull');
    });

    it('Profile and RefreshToken should CASCADE on User deletion', () => {
      const profileModel = getModel('Profile');
      const profileUserRel = profileModel.fields.find((f) => f.name === 'user');
      expect(profileUserRel?.relationOnDelete).toBe('Cascade');

      const rtModel = getModel('RefreshToken');
      const rtUserRel = rtModel.fields.find((f) => f.name === 'user');
      expect(rtUserRel?.relationOnDelete).toBe('Cascade');
    });
  });

  describe('4. Controlled Enums and States', () => {
    it('ConsultationStatus enum should contain all lifecycle states', () => {
      const consultationStatusEnum = getEnum('ConsultationStatus');
      const expectedValues = [
        'REQUESTED',
        'SCHEDULED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'REJECTED',
        'NO_SHOW'
      ];
      const actualValues = consultationStatusEnum.values.map((v) => v.name);
      expect(actualValues).toEqual(expect.arrayContaining(expectedValues));
    });

    it('SlotStatus enum should contain valid scheduling states', () => {
      const slotStatusEnum = getEnum('SlotStatus');
      const expectedValues = ['AVAILABLE', 'RESERVED', 'BOOKED', 'CANCELLED'];
      const actualValues = slotStatusEnum.values.map((v) => v.name);
      expect(actualValues).toEqual(expect.arrayContaining(expectedValues));
    });

    it('PaymentStatus enum should contain all transaction lifecycle states', () => {
      const paymentStatusEnum = getEnum('PaymentStatus');
      const expectedValues = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'];
      const actualValues = paymentStatusEnum.values.map((v) => v.name);
      expect(actualValues).toEqual(expect.arrayContaining(expectedValues));
    });

    it('Role enum should contain PATIENT, DOCTOR, and ADMIN', () => {
      const roleEnum = getEnum('Role');
      const expectedValues = ['PATIENT', 'DOCTOR', 'ADMIN'];
      const actualValues = roleEnum.values.map((v) => v.name);
      expect(actualValues).toEqual(expect.arrayContaining(expectedValues));
    });
  });

  describe('5. Monetary and Precise Types', () => {
    it('Doctor consultationFee, Consultation fee, and Payment amount should use Decimal', () => {
      const doctorModel = getModel('Doctor');
      const feeField = doctorModel.fields.find((f) => f.name === 'consultationFee');
      expect(feeField?.type).toBe('Decimal');

      const consultationModel = getModel('Consultation');
      const consultationFeeField = consultationModel.fields.find((f) => f.name === 'fee');
      expect(consultationFeeField?.type).toBe('Decimal');

      const paymentModel = getModel('Payment');
      const amountField = paymentModel.fields.find((f) => f.name === 'amount');
      expect(amountField?.type).toBe('Decimal');
    });
  });
});
