import { describe, expect, it, vi } from 'vitest';
import {
  PublicGamesService,
  type PublicGamesRepository,
} from './public-games.service.js';

const createdAt = new Date('2026-09-05T12:00:00.000Z');

describe('PublicGamesService', () => {
  it('localizes the developer fallback for discover and detail without a profile', async () => {
    const game = {
      id: 'game-1', slug: 'demo-game', title: 'Demo game', description: '', createdAt,
      artifactVersion: 1, artifactReady: true, coverVersion: 0, coverContentType: null,
      viewportWidth: 16, viewportHeight: 9, owner: { profile: null },
    };
    const service = new PublicGamesService({
      findMany: vi.fn().mockResolvedValue([game]),
      findBySlug: vi.fn().mockResolvedValue(game),
    });
    expect((await service.discover()).games[0]!.developer.displayName).toBe('Nhà phát triển ẩn danh');
    expect((await service.findBySlug('demo-game'))!.developer.displayName).toBe('Nhà phát triển ẩn danh');
  });
  it('lists only clear public games with a capped page and safe summary', async () => {
    const games: PublicGamesRepository = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'game-1',
          slug: 'demo-game',
          title: 'Demo game',
          description: 'A public game',
          createdAt,
          artifactVersion: 1,
          artifactReady: true,
          coverVersion: 2,
          coverContentType: 'image/webp',
          viewportWidth: 16,
          viewportHeight: 9,
          owner: { profile: { displayName: 'Demo developer' } },
        },
      ]),
      findBySlug: vi.fn(),
    };
    const service = new PublicGamesService(games);

    const result = await service.discover({ limit: 100 });

    expect(games.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          visibility: 'PUBLIC',
          moderationState: 'CLEAR',
          reviewState: 'APPROVED',
        },
        take: 51,
      }),
    );
    expect(result).toEqual({
      games: [
        {
          slug: 'demo-game',
          title: 'Demo game',
          description: 'A public game',
          developer: { displayName: 'Demo developer' },
          createdAt: '2026-09-05T12:00:00.000Z',
          artifactVersion: 1,
          artifactReady: true,
          coverVersion: 2,
          coverContentType: 'image/webp',
          viewportWidth: 16,
          viewportHeight: 9,
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('searches case-insensitively and uses the final returned row as the continuation cursor', async () => {
    const games: PublicGamesRepository = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'game-3',
          slug: 'newest',
          title: 'Other game',
          description: 'Another description',
          createdAt: new Date('2026-09-05T12:03:00.000Z'),
          artifactVersion: 1,
          artifactReady: true,
          coverVersion: 0,
          coverContentType: null,
          viewportWidth: 16,
          viewportHeight: 9,
          owner: { profile: { displayName: 'Developer' } },
        },
        {
          id: 'game-2',
          slug: 'search-result',
          title: 'Space Quest',
          description: 'Adventure in space',
          createdAt: new Date('2026-09-05T12:02:00.000Z'),
          artifactVersion: 1,
          artifactReady: true,
          coverVersion: 0,
          coverContentType: null,
          viewportWidth: 16,
          viewportHeight: 9,
          owner: { profile: { displayName: 'Developer' } },
        },
        {
          id: 'game-1',
          slug: 'older-result',
          title: 'Older game',
          description: 'Space is vast',
          createdAt: new Date('2026-09-05T12:01:00.000Z'),
          artifactVersion: 1,
          artifactReady: true,
          coverVersion: 0,
          coverContentType: null,
          viewportWidth: 16,
          viewportHeight: 9,
          owner: { profile: { displayName: 'Developer' } },
        },
      ]),
      findBySlug: vi.fn(),
    };
    const service = new PublicGamesService(games);

    const result = await service.discover({ query: 'space', limit: 2 });

    expect(games.findMany).toHaveBeenCalledWith({
      where: {
        visibility: 'PUBLIC',
        moderationState: 'CLEAR',
        reviewState: 'APPROVED',
        OR: [
          { title: { contains: 'space', mode: 'insensitive' } },
          { description: { contains: 'space', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(result.games).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();

    vi.mocked(games.findMany).mockResolvedValueOnce([]);
    await service.discover({ cursor: result.nextCursor! });
    expect(games.findMany).toHaveBeenLastCalledWith({
      where: {
        visibility: 'PUBLIC',
        moderationState: 'CLEAR',
        reviewState: 'APPROVED',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: 'game-2' },
      skip: 1,
      take: 21,
    });
  });

  it('looks up a slug only when the game is public and clear', async () => {
    const games: PublicGamesRepository = {
      findMany: vi.fn(),
      findBySlug: vi.fn().mockResolvedValue(null),
    };
    const service = new PublicGamesService(games);

    await expect(service.findBySlug('draft-game')).resolves.toBeNull();

    expect(games.findBySlug).toHaveBeenCalledWith({
      where: {
        slug: 'draft-game',
        visibility: 'PUBLIC',
        moderationState: 'CLEAR',
        reviewState: 'APPROVED',
      },
    });
  });
});
