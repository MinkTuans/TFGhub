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

-- Preserve the existing public catalog. These legacy rows have no artifact
-- directory (the later readiness migration keeps artifactReady=false), so they
-- remain discoverable metadata but never receive a playable artifact URL.
UPDATE "Game"
SET "reviewState" = 'APPROVED'
WHERE "visibility" = 'PUBLIC' AND "moderationState" = 'CLEAR';
