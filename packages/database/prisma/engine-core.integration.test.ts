import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/client/index.js';

const databaseUrl = process.env.ENGINE_CORE_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const database = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : undefined;

const execute = async (sql: string) => database!.$executeRawUnsafe(sql);

describeDatabase('engine lifecycle PostgreSQL constraints', () => {
  beforeAll(async () => {
    await execute(`
      TRUNCATE TABLE "GameRelease", "GameBuildAsset", "GameBuild",
        "EngineRevisionAsset", "GameAsset", "EngineProjectRevision",
        "EngineProject", "Game", "DeveloperProfile", "User" CASCADE
    `);
    await execute(`
      INSERT INTO "User" ("id", "email", "passwordHash", "createdAt") VALUES
        ('user-1', 'one@example.test', 'hash', CURRENT_TIMESTAMP),
        ('user-2', 'two@example.test', 'hash', CURRENT_TIMESTAMP)
    `);
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it('accepts unchanged legacy game rows and permits at most one project per game', async () => {
    await execute(`
      INSERT INTO "Game" ("id", "ownerId", "slug", "title", "updatedAt")
      VALUES ('game-1', 'user-1', 'legacy-one', 'Legacy One', CURRENT_TIMESTAMP)
    `);

    const rows = await database!.$queryRawUnsafe<Array<{ currentPublishedReleaseId: string | null }>>(
      'SELECT "currentPublishedReleaseId" FROM "Game" WHERE "id" = \'game-1\'',
    );
    expect(rows).toEqual([{ currentPublishedReleaseId: null }]);

    await execute(`
      INSERT INTO "EngineProject" ("id", "gameId", "createdAt", "updatedAt")
      VALUES ('project-1', 'game-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await expect(
      execute(`
        INSERT INTO "EngineProject" ("id", "gameId", "createdAt", "updatedAt")
        VALUES ('project-duplicate', 'game-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `),
    ).rejects.toThrow();
  });

  it('preserves the four legacy source types and persists ENGINE without changing the default', async () => {
    await execute(`
      INSERT INTO "Game" ("id", "ownerId", "slug", "title", "sourceType", "updatedAt") VALUES
        ('source-upload', 'user-1', 'source-upload', 'Upload', 'UPLOAD', CURRENT_TIMESTAMP),
        ('source-code', 'user-1', 'source-code', 'Code', 'CODE', CURRENT_TIMESTAMP),
        ('source-story', 'user-1', 'source-story', 'Story', 'STORY', CURRENT_TIMESTAMP),
        ('source-platformer', 'user-1', 'source-platformer', 'Platformer', 'PLATFORMER', CURRENT_TIMESTAMP),
        ('source-engine', 'user-1', 'source-engine', 'Engine', 'ENGINE', CURRENT_TIMESTAMP),
        ('source-default', 'user-1', 'source-default', 'Default', DEFAULT, CURRENT_TIMESTAMP)
    `);

    const rows = await database!.$queryRawUnsafe<Array<{ id: string; sourceType: string }>>(
      'SELECT "id", "sourceType"::text AS "sourceType" FROM "Game" WHERE "id" LIKE \'source-%\' ORDER BY "id"',
    );

    expect(rows).toEqual([
      { id: 'source-code', sourceType: 'CODE' },
      { id: 'source-default', sourceType: 'UPLOAD' },
      { id: 'source-engine', sourceType: 'ENGINE' },
      { id: 'source-platformer', sourceType: 'PLATFORMER' },
      { id: 'source-story', sourceType: 'STORY' },
      { id: 'source-upload', sourceType: 'UPLOAD' },
    ]);
  });

  it('enforces revision identity and exactly one build source', async () => {
    await execute(`
      INSERT INTO "EngineProjectRevision"
        ("id", "projectId", "revisionNumber", "schemaVersion", "document",
         "contentHash", "byteSize", "retention", "authorId", "createdAt")
      VALUES
        ('revision-1', 'project-1', 1, 1, '{}'::jsonb,
         repeat('a', 64), 2, 'STANDARD', 'user-1', CURRENT_TIMESTAMP)
    `);
    await expect(
      execute(`
        INSERT INTO "EngineProjectRevision"
          ("id", "projectId", "revisionNumber", "schemaVersion", "document",
           "contentHash", "byteSize", "retention", "authorId", "createdAt")
        VALUES
          ('revision-duplicate', 'project-1', 1, 1, '{}'::jsonb,
           repeat('b', 64), 2, 'STANDARD', 'user-1', CURRENT_TIMESTAMP)
      `),
    ).rejects.toThrow();

    for (const values of [
      "('build-neither', 'game-1', NULL, NULL, 'QUEUED', 'engine', '1', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      "('build-both', 'game-1', 'revision-1', 3, 'QUEUED', 'engine', '1', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    ]) {
      await expect(
        execute(`
          INSERT INTO "GameBuild"
            ("id", "gameId", "engineRevisionId", "legacyArtifactVersion", "state",
             "runtimeFamily", "runtimeVersion", "creatorId", "createdAt", "updatedAt")
          VALUES ${values}
        `),
      ).rejects.toThrow();
    }

    await execute(`
      INSERT INTO "GameBuild"
        ("id", "gameId", "engineRevisionId", "state", "runtimeFamily",
         "runtimeVersion", "creatorId", "createdAt", "updatedAt")
      VALUES
        ('build-1', 'game-1', 'revision-1', 'READY', 'engine', '1',
         'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
  });

  it('pins build asset references to the captured immutable content hash', async () => {
    await execute(`
      INSERT INTO "GameAsset"
        ("id", "projectId", "kind", "displayName", "state", "storageKey",
         "contentHash", "mimeType", "byteSize", "createdAt", "updatedAt")
      VALUES
        ('asset-1', 'project-1', 'IMAGE', 'Hero', 'READY', 'immutable/key',
         repeat('c', 64), 'image/png', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await expect(
      execute(`
        INSERT INTO "GameBuildAsset" ("buildId", "assetId", "contentHash")
        VALUES ('build-1', 'asset-1', repeat('d', 64))
      `),
    ).rejects.toThrow();
    await expect(
      execute(`
        INSERT INTO "GameBuildAsset" ("buildId", "assetId", "contentHash")
        VALUES ('build-1', 'asset-1', repeat('c', 64))
      `),
    ).resolves.toBe(1);
    await expect(
      execute(`
        UPDATE "GameAsset" SET "contentHash" = repeat('e', 64)
        WHERE "id" = 'asset-1'
      `),
    ).rejects.toThrow();
  });

  it('keeps release history, limits published rows, and rejects a cross-game current pointer', async () => {
    await execute(`
      INSERT INTO "Game" ("id", "ownerId", "slug", "title", "updatedAt")
      VALUES ('game-2', 'user-2', 'legacy-two', 'Legacy Two', CURRENT_TIMESTAMP)
    `);
    await execute(`
      INSERT INTO "GameBuild"
        ("id", "gameId", "legacyArtifactVersion", "state", "runtimeFamily",
         "runtimeVersion", "creatorId", "createdAt", "updatedAt")
      VALUES
        ('build-2', 'game-2', 1, 'READY', 'legacy', '1',
         'user-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await execute(`
      INSERT INTO "GameRelease"
        ("id", "gameId", "buildId", "state", "submitterId", "createdAt", "updatedAt")
      VALUES
        ('release-published', 'game-1', 'build-1', 'PUBLISHED', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('release-history', 'game-1', 'build-1', 'SUPERSEDED', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('release-foreign', 'game-2', 'build-2', 'PUBLISHED', 'user-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await expect(
      execute(`
        INSERT INTO "GameRelease"
          ("id", "gameId", "buildId", "state", "submitterId", "createdAt", "updatedAt")
        VALUES
          ('release-second', 'game-1', 'build-1', 'PUBLISHED', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `),
    ).rejects.toThrow();

    await expect(
      execute(`
        UPDATE "Game" SET "currentPublishedReleaseId" = 'release-foreign'
        WHERE "id" = 'game-1'
      `),
    ).rejects.toThrow();
    await expect(
      execute(`
        UPDATE "Game" SET "currentPublishedReleaseId" = 'release-published'
        WHERE "id" = 'game-1'
      `),
    ).resolves.toBe(1);

    await expect(
      execute(`
        UPDATE "GameRelease" SET "originReleaseId" = 'release-foreign'
        WHERE "id" = 'release-history'
      `),
    ).rejects.toThrow();
    await execute(`
      UPDATE "GameRelease" SET "originReleaseId" = 'release-published'
      WHERE "id" = 'release-history'
    `);

    await expect(
      execute('DELETE FROM "Game" WHERE "id" = \'game-1\''),
    ).resolves.toBe(1);
  });
});
