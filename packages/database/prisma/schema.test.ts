import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve('prisma/build/index.js');
const schemaPath = fileURLToPath(new URL('./schema.prisma', import.meta.url));

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
});
