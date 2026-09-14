import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AnalyticsRepository,
  type AnalyticsGame,
  type StoredHeartbeat,
  type StoredSession,
} from '../src/analytics/analytics.service.js';
import {
  AuthUsersRepository,
  type StoredUser,
} from '../src/auth/auth.service.js';

const testSecret = 'analytics-e2e-tests-only-a-long-explicit-signing-secret';

describe('Play analytics HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let sessions: Map<string, StoredSession>;
  let beats: Map<string, StoredHeartbeat>;
  const game: AnalyticsGame = {
    id: 'game-1',
    slug: 'orbit-orchard',
    title: 'Orbit Orchard',
    ownerId: 'user-1',
    visibility: 'PUBLIC',
    moderationState: 'CLEAR',
    accessMode: 'GUEST_ALLOWED',
  };

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    users = new Map();
    sessions = new Map();
    beats = new Map();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        async create(input: { email: string; passwordHash: string }) {
          const id = `user-${users.size + 1}`;
          const user: StoredUser = { ...input, id, role: 'USER' };
          users.set(id, user);
          return user;
        },
        async findByEmail(email: string) {
          return [...users.values()].find((row) => row.email === email) ?? null;
        },
        async findById(id: string) {
          return users.get(id) ?? null;
        },
      })
      .overrideProvider(AnalyticsRepository)
      .useValue({
        async findPublicGame(slug: string) {
          return slug === game.slug ? game : null;
        },
        async findRecentSession(gameId: string, visitorId: string, after: Date) {
          return (
            [...sessions.values()].find(
              (row) =>
                row.gameId === gameId &&
                row.visitorId === visitorId &&
                row.createdAt.getTime() >= after.getTime(),
            ) ?? null
          );
        },
        async findSession(id: string) {
          return sessions.get(id) ?? null;
        },
        async createSession(input: { gameId: string; gameSlug: string; visitorId: string }) {
          const stored: StoredSession = {
            id: `ses-${sessions.size + 1}`,
            valid: true,
            countedSeconds: 0,
            lastHeartbeatAt: null,
            createdAt: new Date(),
            ...input,
          };
          sessions.set(stored.id, stored);
          return stored;
        },
        async saveSession(session: StoredSession) {
          sessions.set(session.id, { ...session });
          return sessions.get(session.id)!;
        },
        async findHeartbeat(eventId: string) {
          return beats.get(eventId) ?? null;
        },
        async addHeartbeat(input: StoredHeartbeat) {
          beats.set(input.eventId, input);
          return input;
        },
        async countRecentHeartbeats() {
          return 0;
        },
        async listOwnerGames(ownerId: string) {
          if (ownerId !== 'user-1') return [];
          const owned = [...sessions.values()].filter((row) => row.gameId === game.id && row.valid);
          return [
            {
              id: game.id,
              slug: game.slug,
              title: game.title,
              validPlays: owned.length,
              countedSeconds: owned.reduce((sum, row) => sum + row.countedSeconds, 0),
            },
          ];
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.unstubAllEnvs();
  });

  it('records a guest play and shows valid minutes on the studio dashboard', async () => {
    const started = await request(app.getHttpServer())
      .post('/analytics/sessions')
      .send({ visitorId: 'visitor-abc', gameSlug: 'orbit-orchard' })
      .expect(201);
    expect(started.body.id).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/analytics/sessions/${started.body.id}/heartbeats`)
      .send({
        eventId: 'heartbeat-abc-1',
        visible: true,
        active: true,
        occurredAt: new Date().toISOString(),
      })
      .expect(201);

    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);
    const dashboard = await owner.get('/analytics/studio').expect(200);
    expect(dashboard.body.games[0]).toMatchObject({
      slug: 'orbit-orchard',
      validPlays: 1,
      validActiveMinutes: 0.25,
      score: 1,
    });
  });
});
