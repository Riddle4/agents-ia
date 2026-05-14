ALTER TABLE "PhoenixBooking" ADD COLUMN "registrationId" TEXT;

CREATE TABLE "PhoenixActivity" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "defaultPrice" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixSession" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "dayOfWeek" TEXT,
  "timeLabel" TEXT,
  "location" TEXT,
  "level" TEXT,
  "capacity" INTEGER,
  "price" DOUBLE PRECISION,
  "instructor" TEXT,
  "sourceType" TEXT,
  "sourceLabel" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixRegistration" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "childId" TEXT,
  "parentId" TEXT,
  "familyId" TEXT,
  "organizationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REGISTERED',
  "sourceType" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixPayment" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "expectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "method" TEXT,
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixInstructor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixInstructor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixInstructorAssignment" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "role" TEXT,
  "fee" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoenixInstructorAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoenixActivity_serviceId_name_key" ON "PhoenixActivity"("serviceId", "name");
CREATE INDEX "PhoenixSession_kind_idx" ON "PhoenixSession"("kind");
CREATE INDEX "PhoenixSession_startAt_idx" ON "PhoenixSession"("startAt");
CREATE UNIQUE INDEX "PhoenixSession_serviceId_sourceType_sourceLabel_startAt_key" ON "PhoenixSession"("serviceId", "sourceType", "sourceLabel", "startAt");
CREATE INDEX "PhoenixRegistration_status_idx" ON "PhoenixRegistration"("status");
CREATE INDEX "PhoenixRegistration_sessionId_idx" ON "PhoenixRegistration"("sessionId");
CREATE UNIQUE INDEX "PhoenixInstructor_name_key" ON "PhoenixInstructor"("name");
CREATE UNIQUE INDEX "PhoenixInstructorAssignment_sessionId_instructorId_key" ON "PhoenixInstructorAssignment"("sessionId", "instructorId");

ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "PhoenixRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixActivity" ADD CONSTRAINT "PhoenixActivity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PhoenixService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixSession" ADD CONSTRAINT "PhoenixSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "PhoenixActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixSession" ADD CONSTRAINT "PhoenixSession_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PhoenixService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixRegistration" ADD CONSTRAINT "PhoenixRegistration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PhoenixSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixRegistration" ADD CONSTRAINT "PhoenixRegistration_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PhoenixPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixRegistration" ADD CONSTRAINT "PhoenixRegistration_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PhoenixPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixRegistration" ADD CONSTRAINT "PhoenixRegistration_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "PhoenixFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixRegistration" ADD CONSTRAINT "PhoenixRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PhoenixOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixPayment" ADD CONSTRAINT "PhoenixPayment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "PhoenixRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixInstructorAssignment" ADD CONSTRAINT "PhoenixInstructorAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PhoenixSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoenixInstructorAssignment" ADD CONSTRAINT "PhoenixInstructorAssignment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "PhoenixInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
