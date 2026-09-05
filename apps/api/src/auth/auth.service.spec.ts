import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

function fixture() {
  const user = {
    id: 'user-1',
    email: 'dev@example.com',
    passwordHash: 'hashed',
    role: 'USER' as const,
  };
  const users = {
    create: vi.fn().mockResolvedValue(user),
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
  };
  const hasher = {
    hash: vi.fn().mockResolvedValue('hashed'),
    verify: vi.fn().mockResolvedValue(true),
  };
  const tokens = { signAsync: vi.fn().mockResolvedValue('access-token') };
  const service = new AuthService(users, hasher, tokens);
  return { service, users, hasher, tokens };
}

describe('AuthService', () => {
  it('normalizes email and persists a password hash, returning only public user fields', async () => {
    const { service, users, hasher, tokens } = fixture();
    const result = await service.register({
      email: ' DEV@Example.COM ',
      password: 'password123',
    });

    expect(hasher.hash).toHaveBeenCalledWith('password123');
    expect(users.create).toHaveBeenCalledWith({
      email: 'dev@example.com',
      passwordHash: 'hashed',
    });
    expect(tokens.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      role: 'USER',
    });
    expect(result).toEqual({
      user: { id: 'user-1', email: 'dev@example.com', role: 'USER' },
      accessToken: 'access-token',
    });
  });

  it('maps a Prisma unique-email violation to conflict', async () => {
    const { service, users } = fixture();
    users.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });
    await expect(
      service.register({ email: 'dev@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves unexpected database failures', async () => {
    const { service, users } = fixture();
    const error = new Error('Database unavailable');
    users.create.mockRejectedValue(error);
    await expect(
      service.register({ email: 'dev@example.com', password: 'password123' }),
    ).rejects.toBe(error);
  });

  it('does not mislabel another unique constraint as a duplicate email', async () => {
    const { service, users } = fixture();
    const error = { code: 'P2002', meta: { target: ['id'] } };
    users.create.mockRejectedValue(error);
    await expect(
      service.register({ email: 'dev@example.com', password: 'password123' }),
    ).rejects.toBe(error);
  });

  it('normalizes login email and verifies the stored password hash before signing', async () => {
    const { service, users, hasher } = fixture();
    const result = await service.login({
      email: ' DEV@Example.COM ',
      password: 'password123',
    });
    expect(users.findByEmail).toHaveBeenCalledWith('dev@example.com');
    expect(hasher.verify).toHaveBeenCalledWith('hashed', 'password123');
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'dev@example.com',
      role: 'USER',
    });
  });

  it.each(['missing user', 'wrong password'])(
    'rejects %s without issuing a token',
    async (reason) => {
      const { service, users, hasher, tokens } = fixture();
      if (reason === 'missing user') users.findByEmail.mockResolvedValue(null);
      else hasher.verify.mockResolvedValue(false);
      await expect(
        service.login({ email: 'dev@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokens.signAsync).not.toHaveBeenCalled();
    },
  );
});
