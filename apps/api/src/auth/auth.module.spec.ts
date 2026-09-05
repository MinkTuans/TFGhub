import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthModule } from './auth.module.js';

describe('AuthModule configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, '', '   '])(
    'refuses to start with JWT_SECRET=%j',
    async (secret) => {
      vi.stubEnv('JWT_SECRET', secret);
      await expect(
        Test.createTestingModule({ imports: [AuthModule] }).compile(),
      ).rejects.toThrow('JWT_SECRET must be configured');
    },
  );
});
