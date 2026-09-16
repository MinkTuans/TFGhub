import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminManagementService } from './admin-management.service.js';

const date = new Date('2026-09-16T12:00:00.000Z');
function fixture() {
  const user = {
    id: 'target',
    email: 'user@example.test',
    passwordHash: 'secret',
    role: 'USER',
    isActive: true,
    adminVersion: 1,
    createdAt: date,
    profile: { displayName: 'User', bio: '' },
    _count: {
      games: 0,
      projectRevisions: 0,
      gameBuilds: 0,
      submittedReleases: 0,
      reviewedReleases: 0,
    },
  };
  const game = {
    id: 'game',
    ownerId: 'target',
    slug: 'game',
    title: 'Game',
    description: '',
    visibility: 'PUBLIC',
    moderationState: 'CLEAR',
    accessMode: 'GUEST_ALLOWED',
    sourceType: 'UPLOAD',
    reviewState: 'APPROVED',
    artifactReady: true,
    artifactVersion: 1,
    submittedAt: date,
    reviewedAt: date,
    reviewNote: 'ok',
    createdAt: date,
    updatedAt: date,
    owner: { email: user.email, profile: user.profile },
    _count: { builds: 0, releases: 0 },
  };
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ where }) =>
          where.id === 'actor' ? { ...user, id: 'actor', role: 'ADMIN' } : user,
        ),
      findUniqueOrThrow: vi.fn().mockResolvedValue(user),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(2),
      create: vi.fn().mockResolvedValue(user),
    },
    developerProfile: { upsert: vi.fn() },
    game: {
      findUnique: vi.fn().mockResolvedValue(game),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => game),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(
          game,
          Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        );
        return { count: 1 };
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (operation) => operation(db));
  const hasher = { hash: vi.fn().mockResolvedValue('hashed'), verify: vi.fn() };
  const service = new AdminManagementService(db as never, hasher);
  return { service, db, user, game, hasher };
}
describe('Admin management invariants', () => {
  it('returns a bounded user DTO without hashes', async () => {
    const { service } = fixture();
    expect(await service.user('target')).toEqual({
      id: 'target',
      email: 'user@example.test',
      role: 'USER',
      isActive: true,
      version: 1,
      displayName: 'User',
      gameCount: 0,
      createdAt: date.toISOString(),
    });
  });
  it('hashes new passwords and keeps them out of responses', async () => {
    const { service, db, hasher } = fixture();
    const result = await service.createUser('actor', {
      email: 'new@example.test',
      password: 'StrongPass1!',
      role: 'USER',
      isActive: true,
    });
    expect(hasher.hash).toHaveBeenCalledWith('StrongPass1!');
    expect(db.user.create.mock.calls[0][0].data.passwordHash).toBe('hashed');
    expect(result).not.toHaveProperty('passwordHash');
  });
  it.each([{ role: 'USER' }, { isActive: false }])(
    'prevents self lockout %j',
    async (change) => {
      const { service } = fixture();
      await expect(
        service.updateUser('actor', 'actor', { version: 1, ...change }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('rechecks actor inside mutation transaction', async () => {
    const { service, db, user } = fixture();
    db.user.findUnique.mockResolvedValue(user);
    await expect(
      service.updateUser('actor', 'target', {
        version: 1,
        email: 'new@example.test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects stale user edits', async () => {
    const { service } = fixture();
    await expect(
      service.updateUser('actor', 'target', { version: 2, isActive: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('protects last active administrator', async () => {
    const { service, db, user } = fixture();
    user.role = 'ADMIN';
    db.user.count.mockResolvedValue(1);
    await expect(
      service.updateUser('actor', 'target', { version: 1, role: 'USER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([
    'games',
    'projectRevisions',
    'gameBuilds',
    'submittedReleases',
    'reviewedReleases',
  ] as const)('blocks deleting user with %s', async (relation) => {
    const { service, user, db } = fixture();
    user._count[relation] = 1;
    await expect(
      service.deleteUser('actor', 'target', { version: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.user.deleteMany).not.toHaveBeenCalled();
  });
  it('deletes an empty account using its current version', async () => {
    const { service, db } = fixture();
    await service.deleteUser('actor', 'target', { version: 1 });
    expect(db.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'target', adminVersion: 1 },
    });
  });
  it('resets reviewed metadata to draft without changing artifact state', async () => {
    const { service, game } = fixture();
    const result = await service.updateGame('actor', 'game', {
      updatedAt: date.toISOString(),
      title: 'Edited',
    });
    expect(result).toMatchObject({
      title: 'Edited',
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
      artifactReady: true,
      artifactVersion: 1,
      submittedAt: null,
    });
    expect(game.reviewedAt).toBeNull();
    expect(game.reviewNote).toBeNull();
  });
  it.each([
    { reviewState: 'DRAFT' },
    { artifactReady: false },
    { moderationState: 'QUARANTINED' },
  ])('rejects unsafe publication %j', async (change) => {
    const { service, game } = fixture();
    Object.assign(game, change);
    await expect(
      service.updateGame('actor', 'game', {
        updatedAt: date.toISOString(),
        visibility: 'PUBLIC',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('quarantines a public game even with unchanged PUBLIC form value', async () => {
    const { service } = fixture();
    expect(
      await service.updateGame('actor', 'game', {
        updatedAt: date.toISOString(),
        visibility: 'PUBLIC',
        moderationState: 'QUARANTINED',
      }),
    ).toMatchObject({
      visibility: 'DRAFT',
      moderationState: 'QUARANTINED',
      reviewState: 'APPROVED',
    });
  });
  it('clearing quarantine does not automatically publish', async () => {
    const { service, game } = fixture();
    game.visibility = 'DRAFT';
    game.moderationState = 'QUARANTINED';
    expect(
      await service.updateGame('actor', 'game', {
        updatedAt: date.toISOString(),
        moderationState: 'CLEAR',
      }),
    ).toMatchObject({ visibility: 'DRAFT', moderationState: 'CLEAR' });
  });
  it('allows publication only from ready approved clear state', async () => {
    const { service, game } = fixture();
    game.visibility = 'UNLISTED';
    expect(
      await service.updateGame('actor', 'game', {
        updatedAt: date.toISOString(),
        visibility: 'PUBLIC',
      }),
    ).toMatchObject({ visibility: 'PUBLIC', reviewState: 'APPROVED' });
  });
  it('rejects stale game writes', async () => {
    const { service } = fixture();
    await expect(
      service.updateGame('actor', 'game', {
        updatedAt: '2026-09-15T12:00:00.000Z',
        title: 'Edited',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['builds', 'releases'] as const)(
    'blocks deleting games with %s',
    async (relation) => {
      const { service, game } = fixture();
      game._count[relation] = 1;
      await expect(
        service.deleteGame('actor', 'game', { updatedAt: date.toISOString() }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('translates remaining FK restrictions to conflict', async () => {
    const { service, db } = fixture();
    db.game.deleteMany.mockRejectedValue({ code: 'P2003' });
    await expect(
      service.deleteGame('actor', 'game', { updatedAt: date.toISOString() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('reports missing games', async () => {
    const { service, db } = fixture();
    db.game.findUnique.mockResolvedValue(null);
    await expect(service.game('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
