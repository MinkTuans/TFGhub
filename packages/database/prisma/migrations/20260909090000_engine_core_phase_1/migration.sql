-- CreateEnum
CREATE TYPE "RevisionRetention" AS ENUM ('STANDARD', 'PINNED');
CREATE TYPE "GameAssetKind" AS ENUM ('IMAGE', 'AUDIO', 'FONT', 'OTHER');
CREATE TYPE "GameAssetState" AS ENUM ('UPLOADING', 'READY', 'TOMBSTONED', 'GC_PENDING');
CREATE TYPE "GameBuildState" AS ENUM ('QUEUED', 'BUILDING', 'READY', 'FAILED', 'CANCELLED');
CREATE TYPE "GameReleaseState" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'REJECTED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "currentPublishedReleaseId" TEXT;

-- CreateTable
CREATE TABLE "EngineProject" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "headRevisionNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngineProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineProjectRevision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "document" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "retention" "RevisionRetention" NOT NULL DEFAULT 'STANDARD',
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineProjectRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameAsset" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "GameAssetKind" NOT NULL,
  "displayName" TEXT NOT NULL,
  "state" "GameAssetState" NOT NULL DEFAULT 'UPLOADING',
  "storageKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "tombstonedAt" TIMESTAMP(3),
  CONSTRAINT "GameAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineRevisionAsset" (
  "revisionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  CONSTRAINT "EngineRevisionAsset_pkey" PRIMARY KEY ("revisionId", "assetId")
);

CREATE TABLE "GameBuild" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "engineRevisionId" TEXT,
  "legacyArtifactVersion" INTEGER,
  "state" "GameBuildState" NOT NULL DEFAULT 'QUEUED',
  "runtimeFamily" TEXT NOT NULL,
  "runtimeVersion" TEXT NOT NULL,
  "manifest" JSONB,
  "contentHash" TEXT,
  "diagnostics" JSONB,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GameBuild_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GameBuild_source_check" CHECK (num_nonnulls("engineRevisionId", "legacyArtifactVersion") = 1)
);

CREATE TABLE "GameBuildAsset" (
  "buildId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  CONSTRAINT "GameBuildAsset_pkey" PRIMARY KEY ("buildId", "assetId")
);

CREATE TABLE "GameRelease" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "buildId" TEXT NOT NULL,
  "state" "GameReleaseState" NOT NULL DEFAULT 'PENDING_REVIEW',
  "submitterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "originReleaseId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GameRelease_gameId_id_key" UNIQUE ("gameId", "id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineProject_gameId_key" ON "EngineProject"("gameId");
CREATE UNIQUE INDEX "EngineProjectRevision_projectId_revisionNumber_key" ON "EngineProjectRevision"("projectId", "revisionNumber");
CREATE UNIQUE INDEX "GameAsset_id_contentHash_key" ON "GameAsset"("id", "contentHash");
CREATE UNIQUE INDEX "GameBuild_gameId_id_key" ON "GameBuild"("gameId", "id");
CREATE UNIQUE INDEX "GameBuildAsset_buildId_assetId_contentHash_key" ON "GameBuildAsset"("buildId", "assetId", "contentHash");
CREATE UNIQUE INDEX "GameRelease_one_published_per_game" ON "GameRelease" ("gameId") WHERE "state" = 'PUBLISHED';

-- AddForeignKey
ALTER TABLE "EngineProject" ADD CONSTRAINT "EngineProject_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineProjectRevision" ADD CONSTRAINT "EngineProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineProjectRevision" ADD CONSTRAINT "EngineProjectRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameAsset" ADD CONSTRAINT "GameAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EngineProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineRevisionAsset" ADD CONSTRAINT "EngineRevisionAsset_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EngineProjectRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineRevisionAsset" ADD CONSTRAINT "EngineRevisionAsset_assetId_contentHash_fkey" FOREIGN KEY ("assetId", "contentHash") REFERENCES "GameAsset"("id", "contentHash") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "GameBuild" ADD CONSTRAINT "GameBuild_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameBuild" ADD CONSTRAINT "GameBuild_engineRevisionId_fkey" FOREIGN KEY ("engineRevisionId") REFERENCES "EngineProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameBuild" ADD CONSTRAINT "GameBuild_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameBuildAsset" ADD CONSTRAINT "GameBuildAsset_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "GameBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameBuildAsset" ADD CONSTRAINT "GameBuildAsset_assetId_contentHash_fkey" FOREIGN KEY ("assetId", "contentHash") REFERENCES "GameAsset"("id", "contentHash") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_gameId_buildId_fkey" FOREIGN KEY ("gameId", "buildId") REFERENCES "GameBuild"("gameId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_gameId_originReleaseId_fkey" FOREIGN KEY ("gameId", "originReleaseId") REFERENCES "GameRelease"("gameId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_current_published_release_fkey"
  FOREIGN KEY ("id", "currentPublishedReleaseId")
  REFERENCES "GameRelease" ("gameId", "id")
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;
