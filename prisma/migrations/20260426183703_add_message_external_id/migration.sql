/*
  Warnings:

  - A unique constraint covering the columns `[source,externalId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Made the column `customerId` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subject` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Made the column `messageType` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Made the column `priority` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sentiment` on table `Message` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_customerId_fkey";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "sourceAccount" TEXT,
ALTER COLUMN "customerId" SET NOT NULL,
ALTER COLUMN "subject" SET NOT NULL,
ALTER COLUMN "messageType" SET NOT NULL,
ALTER COLUMN "priority" SET NOT NULL,
ALTER COLUMN "sentiment" SET NOT NULL,
ALTER COLUMN "requiresHumanValidation" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_source_externalId_key" ON "Message"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
