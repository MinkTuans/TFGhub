-- CreateEnum
CREATE TYPE "GameVersionStatus" AS ENUM ('UPLOADING', 'SCANNING', 'READY', 'REJECTED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "activeVersionId" TEXT;

-- CreateTable
CREATE TABLE "GameVersion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GameVersionStatus" NOT NULL DEFAULT 'UPLOADING',
    "filename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "findings" TEXT NOT NULL DEFAULT '',
    "uploadToken" TEXT,
    "uploadExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_activeVersionId_key" ON "Game"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "GameVersion_uploadToken_key" ON "GameVersion"("uploadToken");

-- CreateIndex
CREATE INDEX "GameVersion_gameId_createdAt_idx" ON "GameVersion"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameVersion" ADD CONSTRAINT "GameVersion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
