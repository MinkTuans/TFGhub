ALTER TABLE "Game"
  ADD COLUMN "coverVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coverContentType" TEXT,
  ADD COLUMN "viewportWidth" INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN "viewportHeight" INTEGER NOT NULL DEFAULT 9;

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_cover_metadata_check"
  CHECK (
    ("coverVersion" = 0 AND "coverContentType" IS NULL)
    OR
    ("coverVersion" > 0 AND "coverContentType" IS NOT NULL AND "coverContentType" IN ('image/jpeg', 'image/png', 'image/webp'))
  );

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_viewport_check"
  CHECK (
    "viewportWidth" BETWEEN 1 AND 4096
    AND "viewportHeight" BETWEEN 1 AND 4096
  );
