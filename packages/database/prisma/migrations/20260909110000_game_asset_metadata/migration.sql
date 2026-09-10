ALTER TABLE "GameAsset" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

-- Reference creation and GC share an asset row lock, including callers outside
-- the API. Existing references/legacy rows are retained without rewriting them.
CREATE FUNCTION enforce_game_asset_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset "GameAsset"; target_project TEXT;
BEGIN
  SELECT * INTO asset FROM "GameAsset" WHERE "id" = NEW."assetId" FOR UPDATE;
  IF TG_TABLE_NAME = 'EngineRevisionAsset' THEN
    SELECT "projectId" INTO target_project FROM "EngineProjectRevision" WHERE "id" = NEW."revisionId";
  ELSE
    SELECT project."id" INTO target_project FROM "GameBuild" build
      JOIN "EngineProject" project ON project."gameId" = build."gameId"
      WHERE build."id" = NEW."buildId";
  END IF;
  IF asset."state" IS DISTINCT FROM 'READY' OR asset."projectId" IS DISTINCT FROM target_project
    OR asset."contentHash" IS DISTINCT FROM NEW."contentHash" THEN
    RAISE EXCEPTION 'Asset reference requires READY content from the same project';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER engine_asset_reference_guard BEFORE INSERT OR UPDATE ON "EngineRevisionAsset"
  FOR EACH ROW EXECUTE FUNCTION enforce_game_asset_reference();
CREATE TRIGGER build_asset_reference_guard BEFORE INSERT OR UPDATE ON "GameBuildAsset"
  FOR EACH ROW EXECUTE FUNCTION enforce_game_asset_reference();

CREATE FUNCTION enforce_game_asset_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" <> 'UPLOADING' AND (
    ROW(NEW."id", NEW."projectId", NEW."contentHash", NEW."storageKey", NEW."kind", NEW."mimeType", NEW."byteSize", NEW."width", NEW."height", NEW."durationMs")
      IS DISTINCT FROM ROW(OLD."id", OLD."projectId", OLD."contentHash", OLD."storageKey", OLD."kind", OLD."mimeType", OLD."byteSize", OLD."width", OLD."height", OLD."durationMs")
    OR (NEW."metadata" - 'category') IS DISTINCT FROM (OLD."metadata" - 'category')) THEN
    RAISE EXCEPTION 'Finalized asset content is immutable';
  END IF;
  IF NEW."state" <> OLD."state" AND NOT (
    (OLD."state" = 'UPLOADING' AND NEW."state" = 'READY') OR
    (OLD."state" = 'READY' AND NEW."state" = 'TOMBSTONED') OR
    (OLD."state" = 'TOMBSTONED' AND NEW."state" = 'GC_PENDING')) THEN
    RAISE EXCEPTION 'Invalid asset lifecycle transition';
  END IF;
  IF NEW."state" = 'GC_PENDING' AND (
    EXISTS (SELECT 1 FROM "EngineRevisionAsset" WHERE "assetId" = NEW."id") OR
    EXISTS (SELECT 1 FROM "GameBuildAsset" WHERE "assetId" = NEW."id")) THEN
    RAISE EXCEPTION 'Referenced asset cannot be garbage collected';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER game_asset_lifecycle_guard BEFORE UPDATE ON "GameAsset"
  FOR EACH ROW EXECUTE FUNCTION enforce_game_asset_lifecycle();
