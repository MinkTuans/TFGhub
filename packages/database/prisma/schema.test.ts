import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve('prisma/build/index.js');
const schemaPath = fileURLToPath(new URL('./schema.prisma', import.meta.url));
const coverMigrationPath = fileURLToPath(
  new URL('./migrations/20260907190000_game_covers/migration.sql', import.meta.url),
);

describe('database schema', () => {
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
  });

  it('declares versioned cover metadata and bounded viewport defaults', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('coverVersion     Int             @default(0)');
    expect(schema).toContain('coverContentType String?');
    expect(schema).toContain('viewportWidth    Int             @default(16)');
    expect(schema).toContain('viewportHeight   Int             @default(9)');
  });

  it('rejects a positive cover version without a content type', () => {
    const migration = readFileSync(coverMigrationPath, 'utf8');

    expect(migration).toContain(
      '("coverVersion" > 0 AND "coverContentType" IS NOT NULL AND "coverContentType" IN (\'image/jpeg\', \'image/png\', \'image/webp\'))',
    );
  });
});
