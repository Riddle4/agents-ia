-- Phoenix CRM
CREATE TABLE "PhoenixService" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoenixService_code_key" ON "PhoenixService"("code");

CREATE TABLE "PhoenixFamily" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixFamily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixOrganization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "type" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixPerson" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "birthDate" TIMESTAMP(3),
  "normalizedEmail" TEXT,
  "normalizedPhone" TEXT,
  "familyId" TEXT,
  "organizationId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixPerson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PhoenixPerson_normalizedEmail_idx" ON "PhoenixPerson"("normalizedEmail");
CREATE INDEX "PhoenixPerson_normalizedPhone_idx" ON "PhoenixPerson"("normalizedPhone");
CREATE INDEX "PhoenixPerson_lastName_firstName_idx" ON "PhoenixPerson"("lastName", "firstName");

CREATE TABLE "PhoenixImportBatch" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "importType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREVIEW',
  "rawRows" JSONB NOT NULL,
  "mapping" JSONB,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixBooking" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "childId" TEXT,
  "parentId" TEXT,
  "familyId" TEXT,
  "organizationId" TEXT,
  "importBatchId" TEXT,
  "bookingDate" TIMESTAMP(3),
  "amount" DOUBLE PRECISION,
  "sourceType" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixOpportunity" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "personId" TEXT,
  "familyId" TEXT,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "estimatedRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoenixOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoenixGeneratedMessage" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoenixGeneratedMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PhoenixPerson" ADD CONSTRAINT "PhoenixPerson_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "PhoenixFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixPerson" ADD CONSTRAINT "PhoenixPerson_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PhoenixOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PhoenixService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PhoenixPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PhoenixPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "PhoenixFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PhoenixOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixBooking" ADD CONSTRAINT "PhoenixBooking_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "PhoenixImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixOpportunity" ADD CONSTRAINT "PhoenixOpportunity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PhoenixService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhoenixOpportunity" ADD CONSTRAINT "PhoenixOpportunity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "PhoenixPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixOpportunity" ADD CONSTRAINT "PhoenixOpportunity_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "PhoenixFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixOpportunity" ADD CONSTRAINT "PhoenixOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PhoenixOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhoenixGeneratedMessage" ADD CONSTRAINT "PhoenixGeneratedMessage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "PhoenixOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
