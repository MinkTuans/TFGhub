import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';

function response() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as never;
}

describe('AuthController session cookie', () => {
  it('creates a persistent cookie when a user logs in', async () => {
    const auth = {
      login: vi.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'dev@example.com', role: 'USER' },
        accessToken: 'access-token',
      }),
      register: vi.fn(),
    };
    const controller = new AuthController(auth as never);
    const reply = response();

    await controller.login(
      { email: 'dev@example.com', password: 'Password123!' },
      reply,
    );

    expect(reply.cookie).toHaveBeenCalledWith(
      'indieforge_access',
      'access-token',
      expect.not.objectContaining({ maxAge: expect.any(Number) }),
    );
  });
});
