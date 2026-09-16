import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  EngagementController,
  OptionalEngagementAuthGuard,
} from './engagement.controller.js';
import { ACCESS_COOKIE } from '../auth/jwt-auth.guard.js';
import type { ExecutionContext } from '@nestjs/common';
describe('optional engagement authentication', () => {
  const context = (cookies: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
    }) as ExecutionContext;
  it('allows missing credentials for guest play', () => {
    const auth = {
      canActivate: vi.fn().mockRejectedValue(new Error('bad token')),
    };
    expect(
      new OptionalEngagementAuthGuard(auth as never).canActivate(context({})),
    ).toBe(true);
  });
  it.each(['', 'invalid'])(
    'rejects presented bad credentials (%s)',
    async (token) => {
      const auth = {
        canActivate: vi.fn().mockRejectedValue(new Error('bad token')),
      };
      await expect(
        new OptionalEngagementAuthGuard(auth as never).canActivate(
          context({ [ACCESS_COOKIE]: token }),
        ),
      ).rejects.toThrow('bad token');
    },
  );
});

describe('guest cookie transport configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ['false', false],
    ['true', true],
    [undefined, true],
  ])('respects production COOKIE_SECURE=%s', (override, expected) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', override);
    const response = { cookie: vi.fn() };
    const service = { start: vi.fn() };
    new EngagementController(service as never).start(
      'game',
      undefined,
      { requestId: '00000000-0000-4000-8000-000000000000' },
      { cookies: {} } as never,
      response as never,
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'tfg_guest',
      expect.stringMatching(/^[a-zA-Z0-9_-]{43}$/),
      expect.objectContaining({
        secure: expected,
        httpOnly: true,
        sameSite: 'lax',
      }),
    );
  });
});
