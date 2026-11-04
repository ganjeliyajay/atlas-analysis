-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "eventQuota" INTEGER NOT NULL DEFAULT 100000;

-- CreateTable
CREATE TABLE "OrganizationUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationUsage_periodStart_idx" ON "OrganizationUsage"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUsage_organizationId_periodStart_key" ON "OrganizationUsage"("organizationId", "periodStart");

-- AddForeignKey
ALTER TABLE "OrganizationUsage" ADD CONSTRAINT "OrganizationUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
