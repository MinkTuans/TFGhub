CREATE TABLE "EngineProjectMutation" (
  "projectId" TEXT NOT NULL,
  "mutationId" VARCHAR(128) NOT NULL,
  "baseRevisionNumber" INTEGER NOT NULL,
  "resultRevisionNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineProjectMutation_pkey" PRIMARY KEY ("projectId", "mutationId"),
  CONSTRAINT "EngineProjectMutation_revision_check" CHECK (
    "baseRevisionNumber" >= 0
    AND "resultRevisionNumber"::bigint = "baseRevisionNumber"::bigint + 1
  ),
  CONSTRAINT "EngineProjectMutation_id_check" CHECK (length("mutationId") > 0),
  CONSTRAINT "EngineProjectMutation_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "EngineProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- NO ACTION preserves replay results but allows project deletion to cascade
  -- through both relations in the same statement.
  CONSTRAINT "EngineProjectMutation_resultRevision_fkey"
    FOREIGN KEY ("projectId", "resultRevisionNumber")
    REFERENCES "EngineProjectRevision"("projectId", "revisionNumber")
    ON DELETE NO ACTION ON UPDATE RESTRICT
);

CREATE INDEX "EngineProjectMutation_projectId_resultRevisionNumber_idx"
  ON "EngineProjectMutation"("projectId", "resultRevisionNumber");
