import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/client/index.js';

const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve('prisma/build/index.js');
const databaseUrl = process.env.ENGINE_GAME_SOURCE_TEST_DATABASE_URL
  ?? process.env.ENGINE_CORE_TEST_DATABASE_URL;
const schemaName = 'engine_game_source_upgrade';
const scopedDatabaseUrl = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      url.searchParams.set('schema', schemaName);
      return url.toString();
    })()
  : undefined;
const describeDatabase = scopedDatabaseUrl ? describe : describe.skip;
const database = scopedDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: scopedDatabaseUrl } } })
  : undefined;
const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const schemaPath = fileURLToPath(new URL('./schema.prisma', import.meta.url));
const sourceMigrationPath = fileURLToPath(
  new URL('./migrations/20260909093000_engine_game_source/migration.sql', import.meta.url),
);
const temporaryPrismaDirectory = mkdtempSync(join(tmpdir(), 'engine-game-source-upgrade-'));
const temporarySchemaPath = join(temporaryPrismaDirectory, 'schema.prisma');
const temporaryMigrationDirectory = join(temporaryPrismaDirectory, 'migrations');
const preEngineSourceMigrations = [
  '20260905105856_initial_domain',
  '20260907060000_game_builds',
  '20260907070000_artifact_readiness',
  '20260907190000_game_covers',
  '20260909090000_engine_core_phase_1',
];

const execute = async (sql: string) => database!.$executeRawUnsafe(sql);

function executeMigrationFile(path: string) {
  execFileSync(
    process.execPath,
    [prismaCliPath, 'db', 'execute', '--file', path, '--schema', temporarySchemaPath],
    {
      env: { ...process.env, DATABASE_URL: scopedDatabaseUrl },
      stdio: 'pipe',
    },
  );
}

describeDatabase('ENGINE game-source PostgreSQL upgrade', () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await execute(`CREATE SCHEMA "${schemaName}"`);
    cpSync(schemaPath, temporarySchemaPath);
    for (const migration of preEngineSourceMigrations) {
      cpSync(
        join(migrationDirectory, migration),
        join(temporaryMigrationDirectory, migration),
        { recursive: true },
      );
    }
    execFileSync(
      process.execPath,
      [prismaCliPath, 'migrate', 'deploy', '--schema', temporarySchemaPath],
      {
        env: { ...process.env, DATABASE_URL: scopedDatabaseUrl },
        stdio: 'pipe',
      },
    );
  });

  afterAll(async () => {
    await database?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await database?.$disconnect();
    rmSync(temporaryPrismaDirectory, { recursive: true, force: true });
  });

  it('preserves existing legacy rows while adding ENGINE and retaining the UPLOAD default', async () => {
    await execute(`
      INSERT INTO "User" ("id", "email", "passwordHash", "createdAt")
      VALUES ('upgrade-user', 'upgrade@example.test', 'hash', CURRENT_TIMESTAMP)
    `);
    await execute(`
      INSERT INTO "Game" ("id", "ownerId", "slug", "title", "sourceType", "updatedAt") VALUES
        ('upgrade-upload', 'upgrade-user', 'upgrade-upload', 'Upload', 'UPLOAD', CURRENT_TIMESTAMP),
        ('upgrade-code', 'upgrade-user', 'upgrade-code', 'Code', 'CODE', CURRENT_TIMESTAMP),
        ('upgrade-story', 'upgrade-user', 'upgrade-story', 'Story', 'STORY', CURRENT_TIMESTAMP),
        ('upgrade-platformer', 'upgrade-user', 'upgrade-platformer', 'Platformer', 'PLATFORMER', CURRENT_TIMESTAMP)
    `);

    const legacyRows = await database!.$queryRawUnsafe<Array<{ id: string; sourceType: string }>>(
      'SELECT "id", "sourceType"::text AS "sourceType" FROM "Game" WHERE "id" LIKE \'upgrade-%\' ORDER BY "id"',
    );

    executeMigrationFile(sourceMigrationPath);
    await execute(`
      INSERT INTO "Game" ("id", "ownerId", "slug", "title", "sourceType", "updatedAt") VALUES
        ('upgrade-engine', 'upgrade-user', 'upgrade-engine', 'Engine', 'ENGINE', CURRENT_TIMESTAMP),
        ('upgrade-default', 'upgrade-user', 'upgrade-default', 'Default', DEFAULT, CURRENT_TIMESTAMP)
    `);

    const rowsAfterUpgrade = await database!.$queryRawUnsafe<Array<{ id: string; sourceType: string }>>(
      'SELECT "id", "sourceType"::text AS "sourceType" FROM "Game" WHERE "id" LIKE \'upgrade-%\' ORDER BY "id"',
    );

    expect(legacyRows).toEqual([
      { id: 'upgrade-code', sourceType: 'CODE' },
      { id: 'upgrade-platformer', sourceType: 'PLATFORMER' },
      { id: 'upgrade-story', sourceType: 'STORY' },
      { id: 'upgrade-upload', sourceType: 'UPLOAD' },
    ]);
    expect(rowsAfterUpgrade).toEqual([
      { id: 'upgrade-code', sourceType: 'CODE' },
      { id: 'upgrade-default', sourceType: 'UPLOAD' },
      { id: 'upgrade-engine', sourceType: 'ENGINE' },
      { id: 'upgrade-platformer', sourceType: 'PLATFORMER' },
      { id: 'upgrade-story', sourceType: 'STORY' },
      { id: 'upgrade-upload', sourceType: 'UPLOAD' },
    ]);
  });
});
