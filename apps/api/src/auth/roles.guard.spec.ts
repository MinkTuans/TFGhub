import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard.js';

function context(role: 'USER' | 'MODERATOR' | 'ADMIN') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as never;
}

describe('RolesGuard', () => {
  it.each(['MODERATOR', 'ADMIN'] as const)(
    'allows %s users into moderator routes',
    (role) => {
      expect(new RolesGuard().canActivate(context(role))).toBe(true);
    },
  );

  it('rejects a regular user from moderator routes', () => {
    expect(() => new RolesGuard().canActivate(context('USER'))).toThrow(
      ForbiddenException,
    );
  });
});
