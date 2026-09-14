import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  AnalyticsService,
  allocationScore,
  type AnalyticsGame,
  type AnalyticsRepository,
  type StoredHeartbeat,
  type StoredSession,
} from './analytics.service.js';

const game: AnalyticsGame = {
  id: 'game-1',
  slug: 'orbit-orchard',
  title: 'Orbit Orchard',
  ownerId: 'owner-1',
  visibility: 'PUBLIC',
  moderationState: 'CLEAR',
  accessMode: 'GUEST_ALLOWED',
};

function repo(
  sessions: Map<string, StoredSession>,
  beats: Map<string, StoredHeartbeat>,
  extras: Partial<AnalyticsRepository> = {},
): AnalyticsRepository {
  return {
    async findPublicGame(slug) {
      return slug === game.slug ? game : null;
    },
    async findRecentSession(gameId, visitorId, after) {
      return (
        [...sessions.values()].find(
          (row) =>
            row.gameId === gameId &&
            row.visitorId === visitorId &&
            row.createdAt.getTime() >= after.getTime(),
        ) ?? null
      );
    },
    async findSession(id) {
      return sessions.get(id) ?? null;
    },
    async createSession(input) {
      const stored: StoredSession = {
        id: `ses-${sessions.size + 1}`,
        valid: true,
        countedSeconds: 0,
        lastHeartbeatAt: null,
        createdAt: new Date('2026-09-05T12:00:00.000Z'),
        ...input,
      };
      sessions.set(stored.id, stored);
      return stored;
    },
    async saveSession(session) {
      sessions.set(session.id, { ...session });
      return sessions.get(session.id)!;
    },
    async findHeartbeat(eventId) {
      return beats.get(eventId) ?? null;
    },
    async addHeartbeat(input) {
      beats.set(input.eventId, input);
      return input;
    },
    async countRecentHeartbeats(sessionId, after) {
      return [...beats.values()].filter(
        (row) => row.sessionId === sessionId && row.createdAt.getTime() >= after.getTime(),
      ).length;
    },
    async listOwnerGames() {
      return [];
    },
    ...extras,
  };
}

describe('AnalyticsService', () => {
  it('scores 30% plays and 70% active minutes after min-max normalization', () => {
    expect(allocationScore(10, 20, 10, 20)).toBe(1);
    expect(allocationScore(5, 10, 10, 20)).toBe(0.5);
  });

  it('reuses a session on rapid reload and ignores duplicate or hidden heartbeats', async () => {
    const sessions = new Map<string, StoredSession>();
    const beats = new Map<string, StoredHeartbeat>();
    let now = new Date('2026-09-05T12:00:00.000Z');
    const service = new AnalyticsService(repo(sessions, beats));
    service.now = () => now;
    const first = await service.startSession(
      { gameSlug: 'orbit-orchard', visitorId: 'visitor-1' },
      null,
    );
    const reload = await service.startSession(
      { gameSlug: 'orbit-orchard', visitorId: 'visitor-1' },
      null,
    );
    expect(reload.id).toBe(first.id);
    expect(sessions.size).toBe(1);

    const counted = await service.heartbeat(first.id, {
      eventId: 'beat-1',
      visible: true,
      active: true,
      occurredAt: now.toISOString(),
    });
    expect(counted).toEqual({ counted: true });
    const dup = await service.heartbeat(first.id, {
      eventId: 'beat-1',
      visible: true,
      active: true,
      occurredAt: now.toISOString(),
    });
    expect(dup).toEqual({ counted: true });
    expect(sessions.get(first.id)?.countedSeconds).toBe(15);

    now = new Date('2026-09-05T12:00:20.000Z');
    const hidden = await service.heartbeat(first.id, {
      eventId: 'beat-2',
      visible: false,
      active: true,
      occurredAt: now.toISOString(),
    });
    expect(hidden).toEqual({ counted: false });
    expect(sessions.get(first.id)?.countedSeconds).toBe(15);
  });

  it('requires a signed-in player for AUTH_REQUIRED games', async () => {
    const locked = { ...game, accessMode: 'AUTH_REQUIRED' as const };
    const service = new AnalyticsService(
      repo(new Map(), new Map(), {
        findPublicGame: async () => locked,
      }),
    );
    await expect(
      service.startSession({ gameSlug: 'orbit-orchard', visitorId: 'visitor-1' }, null),
    ).rejects.toThrow(UnauthorizedException);
  });
});
