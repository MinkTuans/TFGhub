import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  it('accepts a valid persistent session token without an expiration claim', async () => {
    const tokens = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'user-1', role: 'USER' }) };
    const auth = {
      findUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'dev@example.com', role: 'USER' }),
    };
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: { indieforge_access: 'persistent-token' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(new JwtAuthGuard(tokens as never, auth as never).canActivate(context)).resolves.toBe(true);

    expect(tokens.verifyAsync).toHaveBeenCalledWith(
      'persistent-token',
      expect.objectContaining({ ignoreExpiration: true }),
    );
    expect(request.user).toEqual({ id: 'user-1', email: 'dev@example.com', role: 'USER' });
  });
});
