-- CreateEnum
CREATE TYPE "GameSourceType" AS ENUM ('UPLOAD', 'CODE', 'STORY', 'PLATFORMER');

-- CreateEnum
CREATE TYPE "GameReviewState" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Game"
    ADD COLUMN "sourceType" "GameSourceType" NOT NULL DEFAULT 'UPLOAD',
    ADD COLUMN "reviewState" "GameReviewState" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "projectData" JSONB,
    ADD COLUMN "artifactVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "reviewNote" TEXT,
    ADD COLUMN "submittedAt" TIMESTAMP(3),
    ADD COLUMN "reviewedAt" TIMESTAMP(3);
