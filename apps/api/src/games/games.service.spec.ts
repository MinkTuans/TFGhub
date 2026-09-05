import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GamesService, type GamesRepository } from './games.service.js';

const storedGame = {
  id: 'game-1',
  ownerId: 'owner-1',
  slug: 'demo-game',
  title: 'Demo game',
  description: 'A draft game',
  visibility: 'DRAFT' as const,
  accessMode: 'GUEST_ALLOWED' as const,
  moderationState: 'CLEAR' as const,
  createdAt: new Date('2026-09-05T12:00:00.000Z'),
  updatedAt: new Date('2026-09-05T12:00:00.000Z'),
};

function fixture() {
  const games: GamesRepository = {
    create: vi.fn().mockResolvedValue(storedGame),
    findManyByOwner: vi.fn().mockResolvedValue([storedGame]),
    findUnique: vi.fn().mockResolvedValue(storedGame),
    update: vi.fn().mockResolvedValue(storedGame),
  };
  return { service: new GamesService(games), games };
}

describe('GamesService', () => {
  it('creates a draft with clear moderation regardless of client-supplied protected fields', async () => {
    const { service, games } = fixture();

    const result = await service.create('owner-1', {
      title: ' Demo game ',
      slug: 'demo-game',
      description: ' A draft game ',
      accessMode: 'AUTH_REQUIRED',
      ownerId: 'other-user',
      visibility: 'PUBLIC',
      moderationState: 'FLAGGED',
    } as never);

    expect(games.create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      slug: 'demo-game',
      title: ' Demo game ',
      description: ' A draft game ',
      accessMode: 'AUTH_REQUIRED',
      visibility: 'DRAFT',
      moderationState: 'CLEAR',
    });
    expect(result).toEqual({
      id: 'game-1',
      slug: 'demo-game',
      title: 'Demo game',
      description: 'A draft game',
      visibility: 'DRAFT',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    });
  });

  it('does not update another developer game', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      id: 'game-1',
      ownerId: 'owner-1',
    });

    await expect(
      service.updateOwned('game-1', 'owner-2', { title: 'Changed' }),
    ).rejects.toThrow(ForbiddenException);
    expect(games.update).not.toHaveBeenCalled();
  });

  it('updates only the owning developer game and returns the dashboard fields', async () => {
    const { service, games } = fixture();
    vi.mocked(games.update).mockResolvedValue({
      ...storedGame,
      title: 'Changed',
      updatedAt: new Date('2026-09-05T12:05:00.000Z'),
    });

    const result = await service.updateOwned('game-1', 'owner-1', {
      title: 'Changed',
    });

    expect(games.update).toHaveBeenCalledWith('game-1', { title: 'Changed' });
    expect(result).toMatchObject({
      id: 'game-1',
      title: 'Changed',
      updatedAt: '2026-09-05T12:05:00.000Z',
    });
  });

  it('maps only a duplicate slug violation to conflict', async () => {
    const { service, games } = fixture();
    vi.mocked(games.create).mockRejectedValue({
      code: 'P2002',
      meta: { target: ['slug'] },
    });

    await expect(
      service.create('owner-1', {
        title: 'Demo game',
        slug: 'demo-game',
        description: '',
        accessMode: 'GUEST_ALLOWED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    { code: 'P2002', meta: { target: ['id'] } },
    new Error('Database connection lost'),
  ])(
    'propagates the original non-slug persistence error: %j',
    async (error) => {
      const { service, games } = fixture();
      vi.mocked(games.create).mockRejectedValue(error);

      await expect(
        service.create('owner-1', {
          title: 'Demo game',
          slug: 'demo-game',
          description: '',
          accessMode: 'GUEST_ALLOWED',
        }),
      ).rejects.toBe(error);
    },
  );
});
