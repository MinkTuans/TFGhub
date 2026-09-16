import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import * as implementation from './engagement.service.js';
const game = {
  id: 'g',
  slug: 'game',
  ownerId: 'owner',
  title: 'Game',
  reviewState: 'APPROVED',
  visibility: 'PUBLIC',
  moderationState: 'CLEAR',
  artifactReady: true,
  artifactVersion: 1,
  accessMode: 'GUEST_ALLOWED',
  scoresEnabled: false,
};
describe('engagement authorization', () => {
  it('exports the service', () =>
    expect(implementation).toHaveProperty('EngagementService'));
  it('rejects private games before reading public metrics', async () => {
    const db = {
      game: {
        findUnique: vi.fn().mockResolvedValue({ ...game, visibility: 'DRAFT' }),
      },
    };
    await expect(
      new implementation.EngagementService(db as never).publicStats('game'),
    ).rejects.toThrow('Game not found');
  });
  it('does not grant moderator private analytics', async () => {
    const db = { game: { findUnique: vi.fn().mockResolvedValue(game) } };
    await expect(
      new implementation.EngagementService(db as never).analytics('g', {
        id: 'mod',
        role: 'MODERATOR',
      } as never),
    ).rejects.toThrow('Forbidden');
  });
  it('requires login for restricted play', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      game: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ ...game, accessMode: 'AUTH_REQUIRED' }),
      },
    };
    const db = { $transaction: (fn: (v: unknown) => unknown) => fn(tx) };
    await expect(
      new implementation.EngagementService(db as never).start(
        'game',
        undefined,
        'guest',
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toThrow('Unauthorized');
  });
});

describe('play capability updates', () => {
  function setup(
    overrides: Record<string, unknown> = {},
    gameOverrides: Record<string, unknown> = {},
  ) {
    const play = {
      id: 'p',
      gameId: 'g',
      userId: null,
      tokenHash: createHash('sha256').update('token').digest('hex'),
      expiresAt: new Date(Date.now() + 60000),
      sequence: 2,
      activeSeconds: 10,
      lastHeartbeatAt: new Date(Date.now() - 5000),
      ...overrides,
    };
    const tx = {
      $queryRaw: vi.fn(),
      game: {
        findUnique: vi.fn().mockResolvedValue({ ...game, ...gameOverrides }),
      },
      gamePlay: {
        findUnique: vi.fn().mockResolvedValue(play),
        update: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              activeSeconds: play.activeSeconds + data.activeSeconds.increment,
            }),
          ),
      },
      gameScore: {
        findUnique: vi.fn().mockResolvedValue({ score: 99 }),
        upsert: vi
          .fn()
          .mockImplementation(({ update }) => Promise.resolve(update)),
        aggregate: vi.fn().mockResolvedValue({ _max: { score: 99 } }),
      },
    };
    const db = { $transaction: (fn: (v: unknown) => unknown) => fn(tx) };
    return { service: new implementation.EngagementService(db as never), tx };
  }
  it('rejects capability after artifact becomes unavailable', async () => {
    const { service } = setup({}, { artifactReady: false });
    await expect(
      service.heartbeat('game', 'p', {
        token: 'token',
        sequence: 3,
        activeSeconds: 10,
      }),
    ).rejects.toThrow('Game is not playable');
  });
  it('ignores duplicate sequences without crediting time', async () => {
    const { service } = setup();
    await expect(
      service.heartbeat('game', 'p', {
        token: 'token',
        sequence: 2,
        activeSeconds: 30,
      }),
    ).resolves.toEqual({ activeSeconds: 10 });
  });
  it('caps credit to server elapsed seconds', async () => {
    const { service } = setup();
    await expect(
      service.heartbeat('game', 'p', {
        token: 'token',
        sequence: 3,
        activeSeconds: 30,
      }),
    ).resolves.toEqual({ activeSeconds: 15 });
  });
  it('rejects expired sessions', async () => {
    const { service } = setup({ expiresAt: new Date(0) });
    await expect(
      service.heartbeat('game', 'p', {
        token: 'token',
        sequence: 3,
        activeSeconds: 1,
      }),
    ).rejects.toThrow('Unauthorized');
  });
  it('rejects disabled scores', async () => {
    const { service } = setup();
    await expect(
      service.score('game', 'p', { token: 'token', score: 1 }),
    ).rejects.toThrow('Scores are disabled');
  });
  it('retains maximum score for a play', async () => {
    const { service, tx } = setup({}, { scoresEnabled: true });
    await expect(
      service.score('game', 'p', { token: 'token', score: 1 }),
    ).resolves.toEqual({ highScore: 99 });
    expect(tx.gameScore.upsert.mock.calls[0][0].update.score).toBe(99);
  });
});
