import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
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
      participantKey: 'participant',
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
        update: vi.fn().mockImplementation(({ data }) =>
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
  it('returns the participant record separately from the global record', async () => {
    const { service, tx } = setup({}, { scoresEnabled: true });
    tx.gameScore.aggregate.mockImplementation(async ({ where }) => ({
      _max: { score: where.play.participantKey === 'participant' ? 120 : 999 },
    }));
    await expect(
      service.score('game', 'p', { token: 'token', score: 1 }),
    ).resolves.toEqual({ highScore: 999, personalBest: 120 });
    expect(tx.gameScore.aggregate).toHaveBeenCalledWith({
      where: { play: { gameId: 'g', participantKey: 'participant' } },
      _max: { score: true },
    });
  });
  it('retains maximum score for a play', async () => {
    const { service, tx } = setup({}, { scoresEnabled: true });
    await expect(
      service.score('game', 'p', { token: 'token', score: 1 }),
    ).resolves.toEqual({ highScore: 99, personalBest: 99 });
    expect(tx.gameScore.upsert.mock.calls[0][0].update.score).toBe(99);
  });
});

describe('persisted personal best', () => {
  afterEach(() => vi.unstubAllEnvs());

  function setup(scoresEnabled = true) {
    vi.stubEnv('JWT_SECRET', 'score-persistence-test-secret');
    const tx = {
      $queryRaw: vi.fn(),
      game: {
        findUnique: vi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve({ ...game, id: where.slug, scoresEnabled }),
          ),
      },
      gamePlayRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      gamePlay: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
      gameScore: {
        aggregate: vi.fn().mockResolvedValue({ _max: { score: 41 } }),
      },
    };
    return {
      tx,
      service: new implementation.EngagementService({
        $transaction: (fn: (v: unknown) => unknown) => fn(tx),
      } as never),
    };
  }

  it.each([
    { gameId: 'snake', userId: 'alice', guest: 'browser-a' },
    { gameId: 'snake', userId: 'bob', guest: 'browser-a' },
    { gameId: 'other', userId: 'alice', guest: 'browser-a' },
    { gameId: 'snake', userId: undefined, guest: 'browser-a' },
    { gameId: 'snake', userId: undefined, guest: 'browser-b' },
  ])(
    'scopes restored records to $gameId / $userId / $guest',
    async ({ gameId, userId, guest }) => {
      const { service, tx } = setup();
      const result = await service.start(
        gameId,
        userId ? ({ id: userId } as never) : undefined,
        guest,
        'request',
      );
      expect(result).toMatchObject({ personalBest: 41, scoresEnabled: true });
      expect(tx.gameScore.aggregate).toHaveBeenCalledWith({
        where: {
          play: {
            gameId,
            participantKey: createHmac(
              'sha256',
              'score-persistence-test-secret',
            )
              .update(
                `engagement:${userId ? `user:${userId}` : `guest:${guest}`}`,
              )
              .digest('base64url'),
          },
        },
        _max: { score: true },
      });
    },
  );

  it.each([null, 0])(
    'preserves an absent or zero record (%s)',
    async (score) => {
      const { service, tx } = setup();
      tx.gameScore.aggregate.mockResolvedValue({ _max: { score } } as never);
      await expect(
        service.start('snake', undefined, 'guest', 'request'),
      ).resolves.toMatchObject({ personalBest: score });
    },
  );

  it('does not expose saved scores while scoring is disabled', async () => {
    const { service, tx } = setup(false);
    await expect(
      service.start('snake', undefined, 'guest', 'request'),
    ).resolves.toMatchObject({ personalBest: null, scoresEnabled: false });
    expect(tx.gameScore.aggregate).not.toHaveBeenCalled();
  });

  it('refreshes the personal record when an existing launch is retried', async () => {
    const { service, tx } = setup();
    tx.gamePlayRequest.findUnique.mockResolvedValue({
      play: { id: 'existing', expiresAt: new Date(Date.now() + 60000) },
    } as never);
    tx.gameScore.aggregate.mockResolvedValueOnce({ _max: { score: 8 } });
    await expect(
      service.start('snake', undefined, 'guest', 'same-request'),
    ).resolves.toMatchObject({ playId: 'existing', personalBest: 8 });
    await expect(
      service.start('snake', undefined, 'guest', 'same-request'),
    ).resolves.toMatchObject({ playId: 'existing', personalBest: 41 });
  });
});
