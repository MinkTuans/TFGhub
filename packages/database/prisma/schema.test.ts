import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/client/index.js';

const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve('prisma/build/index.js');
const schemaPath = fileURLToPath(new URL('./schema.prisma', import.meta.url));
const coverMigrationPath = fileURLToPath(
  new URL('./migrations/20260907190000_game_covers/migration.sql', import.meta.url),
);
const engineCoreMigrationPath = fileURLToPath(
  new URL('./migrations/20260909090000_engine_core_phase_1/migration.sql', import.meta.url),
);
const engineGameSourceMigrationPath = fileURLToPath(
  new URL('./migrations/20260909093000_engine_game_source/migration.sql', import.meta.url),
);

describe('database schema', () => {
  it('exposes backward-compatible JSON import metadata on assets', () => {
    const asset = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'GameAsset',
    );
    expect(asset?.fields.find(({ name }) => name === 'metadata')).toMatchObject({
      type: 'Json',
      isRequired: true,
      default: '{}',
    });
  });
  it('exposes project-scoped mutation identities and their exact revision relation in the generated client', () => {
    const model = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'EngineProjectMutation',
    );
    expect(model).toBeDefined();
    expect(model!.primaryKey?.fields).toEqual(['projectId', 'mutationId']);
    expect(
      model!.fields.find(({ name }) => name === 'resultRevision'),
    ).toMatchObject({
      type: 'EngineProjectRevision',
      relationFromFields: ['projectId', 'resultRevisionNumber'],
      relationToFields: ['projectId', 'revisionNumber'],
      relationOnDelete: 'NoAction',
    });
  });
  it('is accepted by the Prisma schema validator', () => {
    expect(() => {
      execFileSync(process.execPath, [prismaCliPath, 'validate', '--schema', schemaPath], {
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL ??
            'postgresql://postgres:postgres@localhost:5432/indieforge?schema=public',
        },
        stdio: 'pipe',
      });
    }).not.toThrow();
  }, 15000);

  it('declares versioned cover metadata and bounded viewport defaults', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/coverVersion\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/coverContentType\s+String\?/);
    expect(schema).toMatch(/viewportWidth\s+Int\s+@default\(16\)/);
    expect(schema).toMatch(/viewportHeight\s+Int\s+@default\(9\)/);
  });

  it('rejects a positive cover version without a content type', () => {
    const migration = readFileSync(coverMigrationPath, 'utf8');

    expect(migration).toContain(
      '("coverVersion" > 0 AND "coverContentType" IS NOT NULL AND "coverContentType" IN (\'image/jpeg\', \'image/png\', \'image/webp\'))',
    );
  });

  it('declares the additive engine lifecycle models and keeps the current release as a scalar', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    for (const model of [
      'EngineProject',
      'EngineProjectRevision',
      'GameAsset',
      'EngineRevisionAsset',
      'GameBuild',
      'GameBuildAsset',
      'GameRelease',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }

    expect(schema).toContain('currentPublishedReleaseId String?');
    expect(schema).not.toMatch(/currentPublishedReleaseId\s+String\?\s+@unique/);
    expect(schema).toMatch(/gameId\s+String\s+@unique/);
    expect(schema).toContain('@@unique([projectId, revisionNumber])');
    expect(schema).toContain('@@unique([id, contentHash])');
    expect(schema).toContain('@@id([buildId, assetId])');
  });

  it('contains the PostgreSQL-only lifecycle constraints', () => {
    const migration = readFileSync(engineCoreMigrationPath, 'utf8');

    expect(migration).toContain('CONSTRAINT "GameBuild_source_check" CHECK');
    expect(migration).toContain(
      'FOREIGN KEY ("assetId", "contentHash") REFERENCES "GameAsset"("id", "contentHash")',
    );
    expect(migration).toContain(
      'CONSTRAINT "GameRelease_gameId_id_key" UNIQUE ("gameId", "id")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "GameRelease_one_published_per_game"',
    );
    expect(migration).toContain('WHERE "state" = \'PUBLISHED\'');
    expect(migration).toContain(
      'FOREIGN KEY ("id", "currentPublishedReleaseId")',
    );
    expect(migration).toContain('REFERENCES "GameRelease" ("gameId", "id")');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).not.toMatch(
      /CREATE UNIQUE INDEX[^;]*currentPublishedReleaseId|UNIQUE \("currentPublishedReleaseId"\)/,
    );
  });

  it('adds ENGINE without changing the legacy source type default', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(engineGameSourceMigrationPath, 'utf8');

    expect(schema).toMatch(
      /enum GameSourceType \{\s+UPLOAD\s+CODE\s+STORY\s+PLATFORMER\s+ENGINE\s+\}/,
    );
    expect(schema).toMatch(/sourceType\s+GameSourceType\s+@default\(UPLOAD\)/);
    expect(migration).toContain('ALTER TYPE "GameSourceType" ADD VALUE \'ENGINE\';');
    expect(migration).not.toContain('UPDATE "Game"');
    expect(migration).not.toContain('ALTER COLUMN "sourceType" SET DEFAULT');
  });
});
