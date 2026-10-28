# Amrutam Telemedicine Backend API

Production-oriented backend for the Amrutam Telemedicine Platform, built with Node.js, TypeScript, Express, PostgreSQL, and Prisma ORM.

## Tech Stack

* **Runtime:** Node.js (v20+)
* **Language:** TypeScript (Strict mode enabled)
* **Framework:** Express.js
* **Database & ORM:** PostgreSQL 16 & Prisma ORM
* **Authentication:** JWT (JSON Web Tokens) & bcryptjs
* **Validation:** Zod
* **Testing:** Vitest & Supertest
* **Containerization:** Docker & Docker Compose

---

## Project Structure

```text
amrutam-telemedicine/
├── .github/
│   └── workflows/
│       └── ci.yml                   # Automated CI workflow (Node 20, Postgres service, lint, test, build)
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore configuration
├── docker-compose.yml               # Local PostgreSQL container service
├── Dockerfile                       # Multi-stage production container build
├── docs/
│   ├── architecture.md              # Detailed system architecture, ER & sequence diagrams
│   └── security-checklist.md        # Security verification matrix & threat model
├── eslint.config.mjs                # ESLint 9 configuration with typescript-eslint
├── package.json                     # Project scripts and dependencies
├── prisma/
│   ├── migrations/                  # Version-controlled SQL migration scripts
│   │   └── 20261028120000_init/
│   │       └── migration.sql        # Initial database migration (with custom PostgreSQL constraints)
│   ├── schema.prisma                # Prisma schema and PostgreSQL datasource
│   └── seed.ts                      # Safe development-only synthetic seed script
├── src/
│   ├── app.ts                       # Express application setup and middleware
│   ├── index.ts                     # Entry point and graceful shutdown
│   ├── common/
│   │   └── errors/                  # Custom AppError and HTTP error classes
│   ├── config/
│   │   ├── env.ts                   # Zod-validated environment configuration
│   │   ├── database.ts              # Prisma Client singleton
│   │   └── index.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts       # Reusable JWT authentication & RBAC authorization
│   │   ├── errorHandler.ts          # Centralized error handler
│   │   ├── notFoundHandler.ts       # 404 handler
│   │   ├── validateRequest.ts       # Generic Zod request/query/params validation middleware
│   │   └── index.ts
│   ├── modules/                     # Domain modules
│   │   ├── auth/                    # Authentication module (register, login, me)
│   │   │   ├── auth.controller.ts   # Express request handlers
│   │   │   ├── auth.routes.ts       # Router definitions
│   │   │   ├── auth.service.ts      # Business logic & database operations
│   │   │   ├── auth.validation.ts   # Zod input schemas
│   │   │   └── index.ts
│   │   ├── availability/            # Doctor Availability management module
│   │   │   ├── availability.controller.ts
│   │   │   ├── availability.routes.ts
│   │   │   ├── availability.service.ts
│   │   │   ├── availability.validation.ts
│   │   │   └── index.ts
│   │   ├── bookings/                # Appointment Booking & Idempotency module
│   │   │   ├── bookings.controller.ts
│   │   │   ├── bookings.routes.ts
│   │   │   ├── bookings.service.ts
│   │   │   ├── bookings.validation.ts
│   │   │   └── index.ts
│   │   ├── doctors/                 # Doctor Management module
│   │   │   ├── doctors.controller.ts
│   │   │   ├── doctors.routes.ts
│   │   │   ├── doctors.service.ts
│   │   │   ├── doctors.validation.ts
│   │   │   └── index.ts
│   │   ├── consultations/           # Consultation lifecycle module
│   │   │   ├── consultations.controller.ts
│   │   │   ├── consultations.routes.ts
│   │   │   ├── consultations.service.ts
│   │   │   ├── consultations.validation.ts
│   │   │   └── index.ts
│   │   ├── prescriptions/           # Medical Prescriptions module
│   │   │   └── index.ts
│   │   ├── payments/                # Payment lifecycle & webhook processing
│   │   │   ├── payments.controller.ts
│   │   │   ├── payments.routes.ts
│   │   │   ├── payments.service.ts
│   │   │   ├── payments.validation.ts
│   │   │   └── index.ts
│   │   ├── analytics/               # Admin Analytics & reporting module
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.routes.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── analytics.validation.ts
│   │   │   └── index.ts
│   │   ├── audit/
│   │   └── users/
│   ├── routes/
│   │   └── health.routes.ts         # Health check routes (/health/live, /health/ready)
│   └── services/                    # Shared external and utility services
├── tests/
│   ├── analytics.test.ts            # Admin KPI, trends & doctor metrics tests
│   ├── auth.test.ts                 # Authentication unit and API integration tests
│   ├── bookings.test.ts             # Appointment booking, concurrency & idempotency tests
│   ├── consultations.test.ts        # Consultation lifecycle & prescription tests
│   ├── database.integration.test.ts # Live PostgreSQL integration tests (honestly skipped if offline)
│   ├── doctors.test.ts              # Doctor & Availability API tests (unit & authorization)
│   ├── health.test.ts               # Health and 404 route handling tests
│   ├── payments.test.ts             # Payment initiation, ownership & webhook tests
│   └── schema.test.ts               # In-memory DMMF schema specification tests
├── tsconfig.json                    # TypeScript compiler configuration
└── vitest.config.ts                 # Vitest runner configuration
```

---

## Authentication API Endpoints

### 1. Register User (Patient Only)
* **Endpoint:** `POST /api/v1/auth/register`
* **Access:** Public
* **Rules:**
  * Only public registrations for the `PATIENT` role are permitted.
  * Attempts to register with `ADMIN` or `DOCTOR` roles are strictly blocked with `400 Bad Request`.
  * Emails are automatically trimmed and normalized to lowercase.
  * Passwords must be at least 8 characters long and are hashed using `bcryptjs` (cost factor 10).
  * Returns safe user profile data without exposing password hashes.

**Request Body:**
```json
{
  "name": "Priya Sharma",
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "e4f8d682-16dc-4eb7-a7eb-6c243851b225",
    "email": "priya.sharma@example.com",
    "role": "PATIENT",
    "isActive": true,
    "isEmailVerified": false,
    "profile": {
      "id": "18cf325d-b0a7-4b77-8fa2-fbce3015560c",
      "firstName": "Priya",
      "lastName": "Sharma",
      "phoneNumber": null,
      "gender": "UNDISCLOSED",
      "avatarUrl": null
    },
    "createdAt": "2026-10-28T12:00:00.000Z",
    "updatedAt": "2026-10-28T12:00:00.000Z"
  }
}
```

**Duplicate Email Response (`409 Conflict`):**
```json
{
  "success": false,
  "error": {
    "message": "A user with this email address already exists"
  }
}
```

---

### 2. User Login
* **Endpoint:** `POST /api/v1/auth/login`
* **Access:** Public
* **Rules:**
  * Uses generic error messages (`"Invalid email or password"`) for both non-existent users and mismatched passwords to prevent user enumeration attacks.
  * Issues a cryptographically signed JWT containing minimal, non-sensitive claims (`sub`: User ID, `role`: Account Role, `email`: User Email).

**Request Body:**
```json
{
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "e4f8d682-16dc-4eb7-a7eb-6c243851b225",
      "email": "priya.sharma@example.com",
      "role": "PATIENT",
      "isActive": true,
      "isEmailVerified": false,
      "profile": {
        "id": "18cf325d-b0a7-4b77-8fa2-fbce3015560c",
        "firstName": "Priya",
        "lastName": "Sharma",
        "phoneNumber": null,
        "gender": "UNDISCLOSED",
        "avatarUrl": null
      }
    }
  }
}
```

---

### 3. Get Current User Profile
* **Endpoint:** `GET /api/v1/auth/me`
* **Access:** Protected (`Bearer <token>`)
* **Headers:** `Authorization: Bearer <jwt_token>`

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "e4f8d682-16dc-4eb7-a7eb-6c243851b225",
    "email": "priya.sharma@example.com",
    "role": "PATIENT",
    "isActive": true,
    "isEmailVerified": false,
    "profile": {
      "id": "18cf325d-b0a7-4b77-8fa2-fbce3015560c",
      "firstName": "Priya",
      "lastName": "Sharma",
      "phoneNumber": null,
      "dateOfBirth": null,
      "gender": "UNDISCLOSED",
      "bloodGroup": null,
      "avatarUrl": null
    },
    "doctor": null
  }
}
```

---

## Authentication & Authorization Middleware

* **`authenticate` (`src/middleware/auth.middleware.ts`):**
  * Verifies presence and format of `Authorization: Bearer <token>`.
  * Verifies JWT signature and expiry using `env.JWT_SECRET`.
  * Attaches typed authenticated user payload to `req.user` (`{ id, role, email }`).
  * Returns `401 Unauthorized` for missing, expired, or malformed tokens.

* **`authorize(...roles: Role[])` (`src/middleware/auth.middleware.ts`):**
  * Reusable RBAC middleware enforcing role restrictions (e.g. `authorize(Role.ADMIN)` or `authorize(Role.DOCTOR, Role.ADMIN)`).
  * Returns `403 Forbidden` if an authenticated user lacks the required role.

---

## Doctor Management API Endpoints

### 1. Create Doctor Profile
* **Endpoint:** `POST /api/v1/doctors`
* **Access:** Protected (`ADMIN` only)
* **Rules:**
  * Only users with `Role.ADMIN` can invoke this endpoint.
  * Target `userId` must refer to an existing user with `role = Role.DOCTOR`.
  * Returns `409 Conflict` if the user already has an associated doctor profile.
  * Medical license numbers (`licenseNumber`) are trimmed, uppercased, and guaranteed unique across the platform.
  * Validates consultation fee (`>= 0`), experience years (`>= 0`), specialization, and qualifications via Zod.

**Request Body:**
```json
{
  "userId": "c0000000-0000-0000-0000-000000000003",
  "licenseNumber": "AYUSH-DL-2026-9876",
  "specialization": "Ayurvedic Medicine & Panchakarma",
  "experienceYears": 8,
  "qualifications": ["BAMS", "MD (Ayurveda)"],
  "bio": "Senior Ayurvedic physician specializing in holistic health and chronic disorders.",
  "consultationFee": 750,
  "status": "VERIFIED"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Doctor profile created successfully",
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "userId": "c0000000-0000-0000-0000-000000000003",
    "licenseNumber": "AYUSH-DL-2026-9876",
    "specialization": "Ayurvedic Medicine & Panchakarma",
    "experienceYears": 8,
    "qualifications": ["BAMS", "MD (Ayurveda)"],
    "bio": "Senior Ayurvedic physician specializing in holistic health and chronic disorders.",
    "consultationFee": "750",
    "status": "VERIFIED",
    "createdAt": "2026-10-28T12:00:00.000Z",
    "updatedAt": "2026-10-28T12:00:00.000Z",
    "user": {
      "id": "c0000000-0000-0000-0000-000000000003",
      "email": "dr.sharma@amrutam.co.in",
      "role": "DOCTOR",
      "isActive": true,
      "profile": {
        "firstName": "Aarav",
        "lastName": "Sharma",
        "phoneNumber": "+919876543210",
        "avatarUrl": "https://example.com/avatar.jpg"
      }
    }
  }
}
```

### 2. List Public Doctors
* **Endpoint:** `GET /api/v1/doctors`
* **Access:** Public
* **Query Parameters:**
  * `page` (optional integer, min 1, default 1)
  * `limit` (optional integer, min 1, max 50, default 10)
  * `specialization` (optional string, case-insensitive partial match)
  * `minFee` (optional number, min 0)
  * `maxFee` (optional number, min 0; must be `>= minFee`)
* **Rules:**
  * Returns only verified doctors (`status = VERIFIED`) whose user account is active (`user.isActive = true`).
  * Single-query relation loading prevents N+1 queries.
  * Returns standardized pagination metadata (`page`, `limit`, `total`, `totalPages`).

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "specialization": "Ayurvedic Medicine & Panchakarma",
      "experienceYears": 8,
      "qualifications": ["BAMS", "MD (Ayurveda)"],
      "bio": "Senior Ayurvedic physician...",
      "consultationFee": "750",
      "status": "VERIFIED",
      "createdAt": "2026-10-28T12:00:00.000Z",
      "user": {
        "id": "c0000000-0000-0000-0000-000000000003",
        "email": "dr.sharma@amrutam.co.in",
        "profile": {
          "firstName": "Aarav",
          "lastName": "Sharma",
          "avatarUrl": "https://example.com/avatar.jpg"
        }
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3. Get Doctor Profile by ID
* **Endpoint:** `GET /api/v1/doctors/:id`
* **Access:** Public
* **Rules:**
  * Returns public doctor profile if doctor is verified and user is active.
  * Returns `404 Not Found` if doctor does not exist, is unverified/suspended, or user is inactive.
  * Returns `400 Bad Request` if `:id` is not a valid UUID.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "specialization": "Ayurvedic Medicine & Panchakarma",
    "experienceYears": 8,
    "qualifications": ["BAMS", "MD (Ayurveda)"],
    "bio": "Senior Ayurvedic physician...",
    "consultationFee": "750",
    "status": "VERIFIED",
    "createdAt": "2026-10-28T12:00:00.000Z",
    "user": {
      "id": "c0000000-0000-0000-0000-000000000003",
      "email": "dr.sharma@amrutam.co.in",
      "profile": {
        "firstName": "Aarav",
        "lastName": "Sharma",
        "phoneNumber": "+919876543210",
        "avatarUrl": "https://example.com/avatar.jpg"
      }
    }
  }
}
```

---

## Doctor Availability API Endpoints

### 1. Create Availability Slot
* **Endpoint:** `POST /api/v1/doctors/:doctorId/availability`
* **Access:** Protected (Owning `DOCTOR` or `ADMIN`)
* **Validation & Security Rules:**
  * Server-side authorization enforces that a doctor can only create slots for their own profile. Admins can create slots for any doctor.
  * Chronological integrity: `startTime` must be strictly before `endTime`.
  * Future scheduling: `startTime` cannot be in the past.
  * Duration constraints: Slot duration must be between 15 minutes and 4 hours (240 minutes).
  * Advance window: Slots cannot be scheduled more than 90 days in advance.
  * Overlap rejection: Application query pre-checks for overlapping non-cancelled slots; PostgreSQL exclusion constraint (`no_overlapping_doctor_slots` via `tsrange` and `btree_gist`) acts as concurrency lock.
  * Duplicate or overlapping slots return `409 Conflict`.

**Request Body:**
```json
{
  "startTime": "2026-10-30T09:00:00.000Z",
  "endTime": "2026-10-30T10:00:00.000Z"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Availability slot created successfully",
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "doctorId": "11111111-1111-1111-1111-111111111111",
    "startTime": "2026-10-30T09:00:00.000Z",
    "endTime": "2026-10-30T10:00:00.000Z",
    "status": "AVAILABLE",
    "version": 0,
    "createdAt": "2026-10-28T12:00:00.000Z",
    "updatedAt": "2026-10-28T12:00:00.000Z"
  }
}
```

### 2. Get Doctor Available Slots
* **Endpoint:** `GET /api/v1/doctors/:doctorId/availability`
* **Access:** Public
* **Query Parameters:**
  * `startDate` (optional ISO 8601 timestamp)
  * `endDate` (optional ISO 8601 timestamp; must be `>= startDate`)
  * `page` (optional integer, min 1, default 1)
  * `limit` (optional integer, min 1, max 100, default 20)
* **Rules:**
  * Publicly returns future slots only (`startTime > now`) with `status = AVAILABLE`.
  * Past, booked, and cancelled slots are automatically excluded from public view.
  * Ordered chronologically (`startTime: asc`).

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "doctorId": "11111111-1111-1111-1111-111111111111",
      "startTime": "2026-10-30T09:00:00.000Z",
      "endTime": "2026-10-30T10:00:00.000Z",
      "status": "AVAILABLE",
      "createdAt": "2026-10-28T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3. Cancel Availability Slot
* **Endpoint:** `DELETE /api/v1/doctors/:doctorId/availability/:slotId`
* **Access:** Protected (Owning `DOCTOR` or `ADMIN`)
* **Rules:**
  * Server-side authorization ensures only the owning doctor or an admin can cancel a slot.
  * Non-destructive cancellation: Uses status-based cancellation (`status = CANCELLED`), preserving the audit trail and optimistic locking version counter.
  * Rejects cancellation with `400 Bad Request` if an active consultation is booked for the slot (`consultation.status NOT IN ('CANCELLED', 'REJECTED')`).
  * Rejects with `400 Bad Request` if the slot is already cancelled.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Availability slot cancelled successfully",
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "doctorId": "11111111-1111-1111-1111-111111111111",
    "startTime": "2026-10-30T09:00:00.000Z",
    "endTime": "2026-10-30T10:00:00.000Z",
    "status": "CANCELLED",
    "version": 1,
    "createdAt": "2026-10-28T12:00:00.000Z",
    "updatedAt": "2026-10-28T12:05:00.000Z"
  }
}
```

---

## Appointment Booking API Endpoints

### 1. Book an Appointment
* **Endpoint:** `POST /api/v1/bookings`
* **Access:** Protected (`PATIENT` only)
* **Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `Idempotency-Key: <string>` (Optional, alphanumeric string between 1 and 255 characters)
* **Transaction & Concurrency Safety:**
  * `patientId` is securely extracted from the verified JWT; client-supplied patient IDs are rejected.
  * Fee is determined strictly from the database doctor record (`doctor.consultationFee`), preventing price tampering.
  * Checks slot existence, status (`AVAILABLE`), and chronological validity (`startTime > now`).
  * Verifies associated doctor is active and verified (`status = VERIFIED` and `user.isActive = true`).
  * Executes atomically inside a PostgreSQL Prisma transaction:
    * Updates slot status to `BOOKED` using optimistic concurrency control (`version: slot.version`).
    * Backed by PostgreSQL partial unique index `unique_active_consultation_per_slot` ensuring at most one active consultation per slot.
    * Concurrency conflicts and unique index violations are cleanly caught and translated to HTTP `409 Conflict`.
    * Creates an audit entry in `AuditLog` (`action: APPOINTMENT_BOOKED`).
* **Idempotency Guarantees:**
  * Deterministic SHA-256 request payload hashing.
  * Scoped to the authenticated patient (`userId_key` compound unique constraint).
  * Repeated identical requests replay the original response with `X-Idempotent-Replay: true`.
  * Reusing an idempotency key with a modified request payload returns `422 Unprocessable Entity`.
  * Concurrent in-flight requests with the same key return `409 Conflict`.
  * Idempotency records commit atomically within the booking transaction, ensuring no successful response is returned before commit.

**Request Body:**
```json
{
  "slotId": "33333333-3333-3333-3333-333333333333",
  "symptomsSummary": "Severe migraine for 3 days and digestive discomfort",
  "notes": "Prefers herbal consultation"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "consultationNumber": "AMR-1730100000000-ABCDEF",
    "patientId": "b0000000-0000-0000-0000-000000000002",
    "doctorId": "11111111-1111-1111-1111-111111111111",
    "slotId": "33333333-3333-3333-3333-333333333333",
    "status": "SCHEDULED",
    "fee": "750.00",
    "symptomsSummary": "Severe migraine for 3 days and digestive discomfort",
    "notes": "Prefers herbal consultation",
    "createdAt": "2026-10-28T12:00:00.000Z",
    "doctor": {
      "id": "11111111-1111-1111-1111-111111111111",
      "specialization": "Ayurvedic Medicine & Panchakarma",
      "consultationFee": "750.00",
      "user": {
        "id": "c0000000-0000-0000-0000-000000000003",
        "email": "dr.sharma@amrutam.co.in",
        "profile": {
          "firstName": "Aarav",
          "lastName": "Sharma",
          "avatarUrl": "https://example.com/avatar.jpg"
        }
      }
    },
    "slot": {
      "id": "33333333-3333-3333-3333-333333333333",
      "startTime": "2026-10-30T09:00:00.000Z",
      "endTime": "2026-10-30T10:00:00.000Z",
      "status": "BOOKED"
    }
  }
}
```

### 2. Get My Bookings
* **Endpoint:** `GET /api/v1/bookings`
* **Access:** Protected (`PATIENT` only)
* **Query Parameters:**
  * `page` (optional integer, min 1, default 1)
  * `limit` (optional integer, min 1, max 50, default 10)
  * `status` (optional `ConsultationStatus` filter: `REQUESTED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `REJECTED`, `NO_SHOW`)
* **Rules:**
  * Strictly scoped to the authenticated patient's records; patients cannot view or enumerate other patients' bookings.
  * Eager loading in a single query avoids N+1 database queries.
  * Sorted chronologically by slot appointment time.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "consultationNumber": "AMR-1730100000000-ABCDEF",
      "status": "SCHEDULED",
      "fee": "750.00",
      "symptomsSummary": "Severe migraine...",
      "notes": "Prefers herbal consultation",
      "createdAt": "2026-10-28T12:00:00.000Z",
      "doctor": {
        "id": "11111111-1111-1111-1111-111111111111",
        "specialization": "Ayurvedic Medicine & Panchakarma",
        "consultationFee": "750.00",
        "user": {
          "email": "dr.sharma@amrutam.co.in",
          "profile": {
            "firstName": "Aarav",
            "lastName": "Sharma",
            "avatarUrl": "https://example.com/avatar.jpg"
          }
        }
      },
      "slot": {
        "id": "33333333-3333-3333-3333-333333333333",
        "startTime": "2026-10-30T09:00:00.000Z",
        "endTime": "2026-10-30T10:00:00.000Z",
        "status": "BOOKED"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3. Get Booking Details
* **Endpoint:** `GET /api/v1/bookings/:id`
* **Access:** Protected (Owning Patient or `ADMIN`)
* **Rules:**
  * Server-side ownership verification.
  * Returns `404 Not Found` for nonexistent bookings or when requested by a different non-admin patient to protect patient privacy and prevent user enumeration.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "consultationNumber": "AMR-1730100000000-ABCDEF",
    "patientId": "b0000000-0000-0000-0000-000000000002",
    "status": "SCHEDULED",
    "fee": "750.00",
    "symptomsSummary": "Severe migraine...",
    "notes": "Prefers herbal consultation",
    "cancellationReason": null,
    "createdAt": "2026-10-28T12:00:00.000Z",
    "doctor": { ... },
    "slot": { ... }
  }
}
```

### 4. Cancel Booking
* **Endpoint:** `POST /api/v1/bookings/:id/cancel`
* **Access:** Protected (Owning Patient or `ADMIN`)
* **State Validation & Domain Safety:**
  * Validates booking state before cancellation: completed (`COMPLETED`), already cancelled (`CANCELLED`), or in-progress (`IN_PROGRESS`) consultations cannot be cancelled (`400 Bad Request`).
  * Atomic state transition: consultation status is updated to `CANCELLED` with the supplied `reason`.
  * Domain slot restoration rule: if the associated slot is in the future (`startTime > now`) and is currently `BOOKED`, it is restored to `AVAILABLE` (and its optimistic `version` is incremented). Past slots and doctor-cancelled slots are never reopened.
  * Audit log entry recorded (`action: APPOINTMENT_CANCELLED`).

**Request Body:**
```json
{
  "reason": "Personal schedule conflict; need to reschedule"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Appointment cancelled successfully",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "consultationNumber": "AMR-1730100000000-ABCDEF",
    "status": "CANCELLED",
    "cancellationReason": "Personal schedule conflict; need to reschedule",
    "updatedAt": "2026-10-28T12:15:00.000Z",
    "slot": {
      "id": "33333333-3333-3333-3333-333333333333",
      "startTime": "2026-10-30T09:00:00.000Z",
      "endTime": "2026-10-30T10:00:00.000Z",
      "status": "AVAILABLE"
    }
  }
}
```

---

## Consultation & Prescription API Endpoints

### Consultation Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED: Patient Books Slot
    SCHEDULED --> IN_PROGRESS: Doctor starts consultation (POST /start)
    IN_PROGRESS --> COMPLETED: Doctor completes consultation (POST /complete)
    SCHEDULED --> CANCELLED: Patient / Admin cancels booking (POST /cancel)
    IN_PROGRESS --> IN_PROGRESS: Doctor issues prescription (POST /prescriptions)
    COMPLETED --> COMPLETED: Doctor issues prescription (POST /prescriptions)
```

### 1. List Consultations
* **Endpoint:** `GET /api/v1/consultations`
* **Access:** Protected (Role-Scoped Access)
* **Rules:**
  * `PATIENT`: Lists strictly their own consultations (`patientId = user.id`).
  * `DOCTOR`: Lists strictly consultations assigned to their verified doctor profile (`doctorId = doctor.id`).
  * `ADMIN`: Administrative view across all consultations.
  * Query parameters: `page` (default 1), `limit` (default 10, max 50), `status` (optional `ConsultationStatus`).
  * Single-query eager loading prevents N+1 queries.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "consultationNumber": "AMR-1730100000000-ABCDEF",
      "status": "SCHEDULED",
      "fee": "850.00",
      "symptomsSummary": "Chronic fatigue and joint pain",
      "startedAt": null,
      "endedAt": null,
      "doctor": {
        "id": "11111111-1111-1111-1111-111111111111",
        "specialization": "Ayurveda",
        "consultationFee": "850.00",
        "user": {
          "email": "doctor@amrutam.co.in",
          "profile": {
            "firstName": "Ananya",
            "lastName": "Sharma",
            "avatarUrl": "https://example.com/avatar.jpg"
          }
        }
      },
      "patient": {
        "id": "b0000000-0000-0000-0000-000000000002",
        "email": "patient@example.com",
        "profile": {
          "firstName": "Rahul",
          "lastName": "Verma",
          "avatarUrl": null
        }
      },
      "slot": {
        "id": "33333333-3333-3333-3333-333333333333",
        "startTime": "2026-10-30T09:00:00.000Z",
        "endTime": "2026-10-30T10:00:00.000Z",
        "status": "BOOKED"
      },
      "prescriptions": []
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### 2. Get Consultation by ID
* **Endpoint:** `GET /api/v1/consultations/:id`
* **Access:** Protected (Consultation's Patient, Assigned Doctor, or `ADMIN`)
* **Rules:**
  * Server-side ownership verification.
  * Inaccessible or nonexistent records return `404 Not Found` to prevent account enumeration.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "consultationNumber": "AMR-1730100000000-ABCDEF",
    "status": "SCHEDULED",
    "fee": "850.00",
    "symptomsSummary": "Chronic fatigue and joint pain",
    "notes": "Prior history of arthritis",
    "doctor": { ... },
    "patient": { ... },
    "slot": { ... },
    "prescriptions": []
  }
}
```

### 3. Start Consultation
* **Endpoint:** `POST /api/v1/consultations/:id/start`
* **Access:** Protected (Assigned `DOCTOR` or `ADMIN`)
* **Rules:**
  * Patients are strictly rejected (`403 Forbidden`).
  * Only doctors assigned to the consultation can start it; other doctors receive `403 Forbidden`.
  * Consultation must be in `SCHEDULED` or `REQUESTED` status.
  * Transitions status to `IN_PROGRESS` and sets `startedAt = now()` atomically.
  * Rejects already in-progress, completed, or cancelled consultations with `400 Bad Request`.
  * Records an audit log entry (`action: CONSULTATION_STARTED`).

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Consultation started successfully",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "status": "IN_PROGRESS",
    "startedAt": "2026-10-30T09:02:15.000Z"
  }
}
```

### 4. Complete Consultation
* **Endpoint:** `POST /api/v1/consultations/:id/complete`
* **Access:** Protected (Assigned `DOCTOR` or `ADMIN`)
* **Rules:**
  * Patients are rejected (`403 Forbidden`).
  * Consultation must be in `IN_PROGRESS` status.
  * Transitions status to `COMPLETED` and sets `endedAt = now()` atomically.
  * Rejects already completed or non-started consultations with `400 Bad Request`.
  * Records an audit log entry (`action: CONSULTATION_COMPLETED`).

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Consultation completed successfully",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "status": "COMPLETED",
    "endedAt": "2026-10-30T09:44:30.000Z"
  }
}
```

### 5. Issue Prescription
* **Endpoint:** `POST /api/v1/consultations/:id/prescriptions`
* **Access:** Protected (Assigned `DOCTOR` or `ADMIN`)
* **Rules:**
  * Patients cannot issue prescriptions (`403 Forbidden`).
  * Consultation must be in `IN_PROGRESS` or `COMPLETED` state.
  * Prevents duplicate prescription creation for the same consultation (`409 Conflict`).
  * Creates prescription and medicine items atomically in a single Prisma transaction (`$transaction`).
  * Records an audit log entry (`action: PRESCRIPTION_ISSUED`).

**Request Body:**
```json
{
  "diagnosis": "Vata-Pitta Imbalance leading to Joint Pain",
  "instructions": "Consume with warm water after meals",
  "items": [
    {
      "medicineName": "Ashwagandha Tablets",
      "dosage": "500mg",
      "frequency": "Twice daily after meals",
      "durationDays": 30,
      "instructions": "Take with warm milk"
    },
    {
      "medicineName": "Yograj Guggulu",
      "dosage": "250mg",
      "frequency": "Once daily in the morning",
      "durationDays": 15,
      "instructions": "Take after breakfast"
    }
  ]
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Prescription issued successfully",
  "data": {
    "id": "55555555-5555-5555-5555-555555555555",
    "prescriptionNumber": "RX-1730100000000-KLMNOP",
    "consultationId": "44444444-4444-4444-4444-444444444444",
    "diagnosis": "Vata-Pitta Imbalance leading to Joint Pain",
    "instructions": "Consume with warm water after meals",
    "issuedAt": "2026-10-30T09:40:00.000Z",
    "items": [
      {
        "id": "item-uuid-1",
        "prescriptionId": "55555555-5555-5555-5555-555555555555",
        "medicineName": "Ashwagandha Tablets",
        "dosage": "500mg",
        "frequency": "Twice daily after meals",
        "durationDays": 30,
        "instructions": "Take with warm milk"
      },
      {
        "id": "item-uuid-2",
        "prescriptionId": "55555555-5555-5555-5555-555555555555",
        "medicineName": "Yograj Guggulu",
        "dosage": "250mg",
        "frequency": "Once daily in the morning",
        "durationDays": 15,
        "instructions": "Take after breakfast"
      }
    ]
  }
}
```

### 6. Get Prescription
* **Endpoint:** `GET /api/v1/consultations/:id/prescription`
* **Access:** Protected (Consultation's Patient, Assigned Doctor, or `ADMIN`)
* **Rules:**
  * Returns the prescription and medicine items without leaking unrelated records.
  * Returns `404 Not Found` if unauthorized or if no prescription has been issued yet.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "55555555-5555-5555-5555-555555555555",
    "prescriptionNumber": "RX-1730100000000-KLMNOP",
    "consultationId": "44444444-4444-4444-4444-444444444444",
    "diagnosis": "Vata-Pitta Imbalance leading to Joint Pain",
    "instructions": "Consume with warm water after meals",
    "issuedAt": "2026-10-30T09:40:00.000Z",
    "items": [
      {
        "id": "item-uuid-1",
        "medicineName": "Ashwagandha Tablets",
        "dosage": "500mg",
        "frequency": "Twice daily after meals",
        "durationDays": 30,
        "instructions": "Take with warm milk"
      }
    ]
  }
}
```

---

## Payment Lifecycle & Webhook Endpoints

### Payment Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Patient initiates payment (POST /payments/initiate)
    PENDING --> COMPLETED: Verified webhook payment.succeeded
    PENDING --> FAILED: Verified webhook payment.failed
    COMPLETED --> REFUNDED: Verified webhook payment.refunded
    COMPLETED --> COMPLETED: Idempotent replay of payment.succeeded
    FAILED --> FAILED: Idempotent replay of payment.failed
```

### 1. Initiate Payment
* **Endpoint:** `POST /api/v1/payments/initiate`
* **Access:** Protected (`PATIENT` only)
* **Security & Concurrency Rules:**
  * Strictly derives charge amount from server-side consultation fee (`consultation.fee`); client-supplied amounts or currencies are ignored.
  * Rejects initiation for consultations belonging to another patient (`404 Not Found`).
  * Rejects initiation for cancelled or rejected consultations (`400 Bad Request`).
  * Prevents duplicate payments if the consultation already has a `COMPLETED` payment (`409 Conflict`).
  * Creates a transactionally committed record with initial status `PENDING`.
  * Production safeguard: Development mock provider (`PAYMENT_PROVIDER=mock`) is explicitly forbidden in production (`NODE_ENV=production`). Production environments require verified gateway credentials.

**Request Body:**
```json
{
  "consultationId": "44444444-4444-4444-4444-444444444444",
  "method": "UPI"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "payment": {
      "id": "66666666-6666-6666-6666-666666666666",
      "transactionId": "TXN-1730100000000-ABCDEF",
      "consultationId": "44444444-4444-4444-4444-444444444444",
      "amount": "850.00",
      "currency": "INR",
      "status": "PENDING",
      "method": "UPI",
      "gatewayReference": "order_mock_1730100000000_xyz",
      "createdAt": "2026-10-28T12:00:00.000Z"
    },
    "provider": "mock"
  }
}
```

### 2. Get Payment Status
* **Endpoint:** `GET /api/v1/payments/:id`
* **Access:** Protected (Payment Owner or `ADMIN`)
* **Rules:**
  * Enforces ownership server-side.
  * Returns safe payment metadata only without exposing provider credentials or unrelated user secrets.
  * Returns `404 Not Found` for unauthorized or missing payments.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "66666666-6666-6666-6666-666666666666",
    "transactionId": "TXN-1730100000000-ABCDEF",
    "consultationId": "44444444-4444-4444-4444-444444444444",
    "amount": "850.00",
    "currency": "INR",
    "status": "COMPLETED",
    "method": "UPI",
    "gatewayReference": "order_mock_1730100000000_xyz",
    "paidAt": "2026-10-28T12:05:00.000Z",
    "failureReason": null,
    "createdAt": "2026-10-28T12:00:00.000Z",
    "updatedAt": "2026-10-28T12:05:00.000Z"
  }
}
```

### 3. Asynchronous Payment Webhook
* **Endpoint:** `POST /api/v1/payments/webhook`
* **Access:** Public (Cryptographically verified)
* **Signature Verification & Idempotency Rules:**
  * Expects provider HMAC SHA-256 signature header (`x-payment-signature`, `x-razorpay-signature`, or `stripe-signature`).
  * Computes HMAC SHA-256 over raw request buffer (`req.rawBody`) using `env.PAYMENT_WEBHOOK_SECRET` and validates via constant-time comparison (`crypto.timingSafeEqual`).
  * Rejects missing or invalid signatures with `400 Bad Request`.
  * Idempotent event processing: replayed webhook notifications for already completed or failed transactions do not duplicate database mutations or audit logs.
  * Out-of-order rejection: prevents invalid transitions (e.g., attempting to complete a payment in `FAILED` or `CANCELLED` state).
  * Executes payment state transitions inside an atomic transaction with audit trail logging.

**Request Headers:**
```http
Content-Type: application/json
x-payment-signature: 4f5a...[hex HMAC SHA-256 signature]
```

**Request Body (`payment.succeeded`):**
```json
{
  "event": "payment.succeeded",
  "data": {
    "transactionId": "TXN-1730100000000-ABCDEF",
    "gatewayReference": "order_mock_1730100000000_xyz"
  }
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "processed": true,
  "idempotent": false,
  "status": "COMPLETED"
}
```

---

## Admin Analytics API Endpoints

### 1. Dashboard KPI Summary
* **Endpoint:** `GET /api/v1/admin/analytics/summary`
* **Access:** Protected (`ADMIN` only)
* **Metrics Supported by Schema:**
  * Total registered users (`users.total`).
  * Total active patients (`users.activePatients`).
  * Total verified doctors (`users.verifiedDoctors`).
  * Total consultations platform-wide (`consultations.total`).
  * Upcoming consultations (`consultations.upcoming`).
  * Consultation count grouped by status (`consultations.byStatus`).
  * Total payments grouped by status (`payments.byStatus`).
  * Total completed revenue (`payments.revenue.totalCompletedAmount`) and completed count (`payments.revenue.completedCount`), strictly aggregating `COMPLETED` transactions in `INR`.
* **Privacy & Efficiency Rules:**
  * Database-level `count`, `groupBy`, and `aggregate` calls avoid loading tables into memory.
  * Never exposes patient names, contact numbers, symptoms, or prescriptions.
  * Handles empty databases gracefully with zero sums and empty status maps.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 50,
      "activePatients": 40,
      "verifiedDoctors": 10
    },
    "consultations": {
      "total": 25,
      "upcoming": 8,
      "byStatus": {
        "SCHEDULED": 8,
        "COMPLETED": 14,
        "CANCELLED": 3
      }
    },
    "payments": {
      "totalTransactions": 20,
      "byStatus": {
        "COMPLETED": 14,
        "PENDING": 4,
        "FAILED": 2
      },
      "revenue": {
        "totalCompletedAmount": 11900,
        "currency": "INR",
        "completedCount": 14
      }
    }
  }
}
```

### 2. Time-Series Trends
* **Endpoint:** `GET /api/v1/admin/analytics/trends`
* **Access:** Protected (`ADMIN` only)
* **Query Parameters:**
  * `startDate` (optional ISO 8601 timestamp, defaults to 30 days ago)
  * `endDate` (optional ISO 8601 timestamp, defaults to now; must be `>= startDate`)
  * `interval` (`day` or `month`, default `day`)
* **Rules & Validation:**
  * Rejects `startDate > endDate` (`400 Bad Request`).
  * Limits query span to max 90 days for daily interval and max 365 days for monthly interval to protect database performance.
  * Groups consultation counts and completed payment revenues chronologically.
  * Excludes failed, pending, or refunded transactions from revenue.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "startDate": "2026-10-01T00:00:00.000Z",
    "endDate": "2026-10-15T00:00:00.000Z",
    "interval": "day",
    "currency": "INR",
    "data": [
      {
        "date": "2026-10-05",
        "consultationsTotal": 2,
        "consultationsCompleted": 1,
        "consultationsCancelled": 0,
        "revenueAmount": 850
      },
      {
        "date": "2026-10-06",
        "consultationsTotal": 1,
        "consultationsCompleted": 0,
        "consultationsCancelled": 1,
        "revenueAmount": 600
      }
    ]
  }
}
```

### 3. Doctor Performance Statistics
* **Endpoint:** `GET /api/v1/admin/analytics/doctors`
* **Access:** Protected (`ADMIN` only)
* **Query Parameters:**
  * `page` (optional integer, min 1, default 1)
  * `limit` (optional integer, min 1, max 50, default 10)
  * `doctorId` (optional UUID)
* **Rules & Metrics:**
  * Aggregates total, completed, and cancelled consultation counts per doctor.
  * Calculates total revenue generated from completed consultations.
  * Supports pagination with metadata (`page`, `limit`, `total`, `totalPages`).
  * Single-query eager loading eliminates N+1 queries.
  * Strictly strips all patient identities, contact details, medical history, and prescriptions.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "doctorName": "Dr. Ananya Sharma",
      "email": "dr.sharma@amrutam.co.in",
      "specialization": "Ayurvedic Medicine",
      "licenseNumber": "AYU-DL-2024-00876",
      "status": "VERIFIED",
      "consultationFee": 750,
      "metrics": {
        "totalConsultations": 18,
        "completedConsultations": 14,
        "cancelledConsultations": 2,
        "totalRevenueGenerated": 10500,
        "currency": "INR"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Application environment (`development`, `production`, `test`) | `development` |
| `PORT` | HTTP server port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_telemedicine?schema=public` |
| `JWT_SECRET` | Secret key for signing and verifying JWT tokens (min 32 chars) | `dev_super_secret_jwt_key_min_32_characters_12345` |
| `JWT_EXPIRES_IN` | JWT expiration duration | `1d` |
| `CORS_ORIGIN` | Allowed CORS origins (`*` or comma-separated URLs) | `*` |
| `PAYMENT_PROVIDER` | Payment provider engine (`mock`, `razorpay`, `stripe`) | `mock` (development only) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC SHA-256 secret key for verifying provider webhooks | `dev_payment_webhook_secret_key_12345` |
| `PAYMENT_KEY_ID` | Production payment gateway API key ID | Required in production |
| `PAYMENT_KEY_SECRET` | Production payment gateway API secret key | Required in production |

---

## Getting Started

### 1. Prerequisites

* Node.js (v20.x or higher)
* npm (v10.x or higher)
* Docker & Docker Compose (optional for local PostgreSQL)

### 2. Installation

```bash
npm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

### 4. Database Setup (Local Docker)

Start PostgreSQL:

```bash
docker compose up -d postgres
```

### 5. Run Migrations & Seed Data

```bash
npm run prisma:migrate
npm run prisma:seed
```

### 6. Start the API Server

```bash
npm run dev
```

---

## Available NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs the API server in development mode with live reload (`tsx watch`) |
| `npm run build` | Compiles TypeScript into the `dist/` directory |
| `npm start` | Runs the compiled production build from `dist/index.js` |
| `npm run typecheck` | Executes TypeScript type checking without emitting files |
| `npm run lint` | Lints TypeScript files using ESLint |
| `npm run lint:fix` | Automatically fixes fixable ESLint errors |
| `npm test` | Runs the automated test suite with Vitest |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run prisma:validate` | Validates the Prisma schema syntax and datasource |
| `npm run prisma:generate` | Generates the strongly-typed Prisma Client |
| `npm run prisma:migrate` | Runs Prisma development migrations against local database |
| `npm run prisma:status` | Checks migration status against connected database |
| `npm run prisma:seed` | Seeds safe synthetic development data |

---

## Health Check Endpoints

* **Liveness Probe:** `GET /health/live` (Returns `200 OK` when process is running)
* **Readiness Probe:** `GET /health/ready` (Returns `200 OK` when PostgreSQL is connected, `503` if disconnected)

---

## Docker Build

```bash
docker build -t amrutam-telemedicine:latest .
docker run -p 5000:5000 --env-file .env amrutam-telemedicine:latest
```

---

## API Endpoints Reference Matrix

| Domain Module | Method | Endpoint | Access Role | Description |
|---|---|---|---|---|
| **Health** | `GET` | `/health/live` | Public | Liveness probe (process uptime) |
| **Health** | `GET` | `/health/ready` | Public | Readiness probe (database connectivity) |
| **Auth** | `POST` | `/api/v1/auth/register` | Public (PATIENT only) | Register patient account |
| **Auth** | `POST` | `/api/v1/auth/login` | Public | Authenticate user & issue JWT |
| **Auth** | `GET` | `/api/v1/auth/me` | Protected | Introspect authenticated user profile |
| **Doctors** | `POST` | `/api/v1/doctors` | Protected (`ADMIN`) | Onboard and verify a doctor profile |
| **Doctors** | `GET` | `/api/v1/doctors` | Public | Paginated verified doctor directory |
| **Doctors** | `GET` | `/api/v1/doctors/:id` | Public | View public doctor profile |
| **Availability** | `POST` | `/api/v1/doctors/:doctorId/availability` | Protected (Doctor / Admin) | Create non-overlapping availability slot |
| **Availability** | `GET` | `/api/v1/doctors/:doctorId/availability` | Public | List available future slots |
| **Availability** | `DELETE` | `/api/v1/doctors/:doctorId/availability/:slotId` | Protected (Doctor / Admin) | Non-destructive slot cancellation |
| **Bookings** | `POST` | `/api/v1/bookings` | Protected (`PATIENT`) | Transactional booking with optimistic locking |
| **Bookings** | `GET` | `/api/v1/bookings` | Protected (`PATIENT`) | List patient's own bookings |
| **Bookings** | `GET` | `/api/v1/bookings/:id` | Protected (Owner / Admin) | View booking details |
| **Bookings** | `POST` | `/api/v1/bookings/:id/cancel` | Protected (Owner / Admin) | Cancel booking & conditionally restore slot |
| **Consultations** | `GET` | `/api/v1/consultations` | Protected (Role-scoped) | Role-filtered consultation listing |
| **Consultations** | `GET` | `/api/v1/consultations/:id` | Protected (Owner / Admin) | View consultation details |
| **Consultations** | `POST` | `/api/v1/consultations/:id/start` | Protected (Doctor / Admin) | Transition consultation to IN_PROGRESS |
| **Consultations** | `POST` | `/api/v1/consultations/:id/complete` | Protected (Doctor / Admin) | Transition consultation to COMPLETED |
| **Prescriptions** | `POST` | `/api/v1/consultations/:id/prescriptions` | Protected (Doctor / Admin) | Issue medical prescription with items |
| **Prescriptions** | `GET` | `/api/v1/consultations/:id/prescription` | Protected (Owner / Admin) | View prescription details |
| **Payments** | `POST` | `/api/v1/payments/initiate` | Protected (`PATIENT`) | Initiate payment session (server fee only) |
| **Payments** | `GET` | `/api/v1/payments/:id` | Protected (Owner / Admin) | View payment status |
| **Payments** | `POST` | `/api/v1/payments/webhook` | Public (Signature-verified) | Cryptographic HMAC SHA-256 webhook reconciliation |
| **Analytics** | `GET` | `/api/v1/admin/analytics/summary` | Protected (`ADMIN`) | Platform KPIs & revenue aggregates |
| **Analytics** | `GET` | `/api/v1/admin/analytics/trends` | Protected (`ADMIN`) | Bounded time-series consultation/revenue trends |
| **Analytics** | `GET` | `/api/v1/admin/analytics/doctors` | Protected (`ADMIN`) | Aggregated doctor clinical metrics |

---

## Continuous Integration (CI) Pipeline

The project includes an automated GitHub Actions workflow defined in [`.github/workflows/ci.yml`](file:///Users/apple/Desktop/amrutam-telemedicine/.github/workflows/ci.yml):

- **Environment**: Runs on `ubuntu-latest` with Node.js 20 LTS.
- **Service Container**: Spins up a dedicated PostgreSQL 16 container (`postgres:16-alpine`) with health checks (`pg_isready`).
- **Pipeline Stages**:
  1. `npm ci` (clean reproducible dependency install)
  2. `npm run prisma:validate` (schema syntax & datasource validation)
  3. `npm run prisma:generate` (strongly-typed Prisma Client generation)
  4. `npx prisma migrate deploy` (version-controlled SQL migrations)
  5. `npm run typecheck` (`tsc --noEmit` strict typecheck)
  6. `npm run lint` (`eslint "src/**/*.ts"`)
  7. `npm test` (full Vitest test suite)
  8. `npm run build` (production compiler output to `dist/`)

---

## Documentation & Architecture Guides

* [**Architecture & System Design (`docs/architecture.md`)**](file:///Users/apple/Desktop/amrutam-telemedicine/docs/architecture.md): Contains system overview, component diagrams, PostgreSQL ER diagram, appointment booking sequence diagram, consultation lifecycle state machine, payment webhook reconciliation, caching strategy, and 100k daily consultation scaling blueprint.
* [**Security Verification & Threat Model (`docs/security-checklist.md`)**](file:///Users/apple/Desktop/amrutam-telemedicine/docs/security-checklist.md): Contains the 18-point security control verification matrix, threat model (assets, boundaries, threat actors, attack vectors, mitigations, and residual risks), and production operational recommendations.

---

## Testing & Verification Status

### Test Suite Execution
Run the complete automated test suite locally:

```bash
npm test
```

### Live PostgreSQL Integration Test Status
- **Current Local Status**: The local PostgreSQL daemon on `localhost:5432` is offline. The integration test suite in [`tests/database.integration.test.ts`](file:///Users/apple/Desktop/amrutam-telemedicine/tests/database.integration.test.ts) honestly detects this bounded probe failure and skips the 4 live PostgreSQL database tests without error masking.
- **CI Status**: When executed inside GitHub Actions, the workflow spins up a live PostgreSQL 16 container service, allowing all database integration tests to run against an active database.

### Known Limitations & Production Prerequisites
1. **Payment Provider**: Uses a verified development mock provider in local/test modes. In production (`NODE_ENV=production`), real gateway API keys (`PAYMENT_KEY_ID`, `PAYMENT_WEBHOOK_SECRET`) must be provided.
2. **Rate Limiting**: Application-level rate limiting is recommended to be enforced at the reverse proxy or API Gateway level.
3. **Database Performance Claims**: Performance targets (P95 reads < 200 ms, writes < 500 ms, and 99.95% availability) represent architectural scaling targets and have not yet been certified via production load testing.
