import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    env: { JWT_SECRET: 'api-e2e-tests-only-explicit-signing-secret' },
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
