import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
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

  it('issues session JWTs without an automatic expiration', async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-long-secret');
    const module = await Test.createTestingModule({ imports: [AuthModule] }).compile();
    const tokens = module.get(JwtService);

    const token = await tokens.signAsync({ sub: 'user-1', role: 'USER' });

    expect(tokens.decode(token)).not.toHaveProperty('exp');
  });
});
