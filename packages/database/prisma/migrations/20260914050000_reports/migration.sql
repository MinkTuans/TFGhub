-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('MALWARE', 'PROHIBITED', 'COPYRIGHT', 'IMPERSONATION', 'MISLEADING');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'APPEALED', 'RESTORED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "moderationReason" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "appealMessage" TEXT NOT NULL DEFAULT '',
    "resolutionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_gameId_reporterId_idx" ON "Report"("gameId", "reporterId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
