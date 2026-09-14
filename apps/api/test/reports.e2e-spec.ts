import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AuthUsersRepository,
  type StoredUser,
} from '../src/auth/auth.service.js';
import {
  ReportsRepository,
  type ReportGame,
  type StoredReport,
} from '../src/reports/reports.service.js';

const testSecret = 'reports-e2e-tests-only-a-long-explicit-signing-secret';

describe('Report and quarantine HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let reports: Map<string, StoredReport>;
  const game: ReportGame = {
    id: 'game-1',
    slug: 'orbit-orchard',
    title: 'Orbit Orchard',
    ownerId: 'user-1',
    visibility: 'PUBLIC',
    moderationState: 'CLEAR',
    moderationReason: '',
  };

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    users = new Map();
    reports = new Map();
    game.moderationState = 'CLEAR';
    game.moderationReason = '';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        async create(input: { email: string; passwordHash: string }) {
          const id = `user-${users.size + 1}`;
          const role = input.email.startsWith('mod@') ? 'MODERATOR' : 'USER';
          const user: StoredUser = { ...input, id, role };
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
      .overrideProvider(ReportsRepository)
      .useValue({
        async findPublicGame(slug: string) {
          return slug === game.slug ? { ...game } : null;
        },
        async findOpenByReporter(gameId: string, reporterId: string) {
          return (
            [...reports.values()].find(
              (row) =>
                row.gameId === gameId &&
                row.reporterId === reporterId &&
                (row.status === 'OPEN' || row.status === 'APPEALED'),
            ) ?? null
          );
        },
        async findById(id: string) {
          const row = reports.get(id);
          return row ? { ...row, game: { ...row.game } } : null;
        },
        async create(input: {
          gameId: string;
          reporterId: string;
          category: StoredReport['category'];
          evidence: string;
        }) {
          const stored: StoredReport = {
            id: `rep-${reports.size + 1}`,
            status: 'OPEN',
            appealMessage: '',
            resolutionReason: '',
            createdAt: new Date(),
            game: { ...game },
            ...input,
          };
          reports.set(stored.id, stored);
          return { ...stored, game: { ...stored.game } };
        },
        async saveReport(report: StoredReport) {
          reports.set(report.id, { ...report, game: { ...report.game } });
          return { ...reports.get(report.id)! };
        },
        async setGameModeration(
          _gameId: string,
          state: ReportGame['moderationState'],
          reason: string,
        ) {
          game.moderationState = state;
          game.moderationReason = reason;
          for (const row of reports.values()) {
            row.game.moderationState = state;
            row.game.moderationReason = reason;
          }
        },
        async listQueue() {
          return [...reports.values()].filter(
            (row) => row.status === 'OPEN' || row.status === 'APPEALED',
          );
        },
        async listForOwner(ownerId: string) {
          return [...reports.values()].filter((row) => row.game.ownerId === ownerId);
        },
        async countOpen() {
          return [...reports.values()].filter(
            (row) => row.status === 'OPEN' || row.status === 'APPEALED',
          ).length;
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

  it('quarantines malware immediately and lets a moderator restore after appeal', async () => {
    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);
    const reporter = request.agent(app.getHttpServer());
    await reporter
      .post('/auth/register')
      .send({ email: 'player@example.com', password: 'password123' })
      .expect(201);
    const mod = request.agent(app.getHttpServer());
    await mod
      .post('/auth/register')
      .send({ email: 'mod@example.com', password: 'password123' })
      .expect(201);

    game.ownerId = 'user-1';
    const created = await reporter
      .post('/games/orbit-orchard/reports')
      .send({
        category: 'MALWARE',
        evidence: 'The zip executed an unexpected binary',
      })
      .expect(201);
    expect(created.body.moderationState).toBe('QUARANTINED');

    await reporter.get('/moderation/reports').expect(403);
    const queue = await mod.get('/moderation/reports').expect(200);
    expect(queue.body).toHaveLength(1);

    await owner
      .post(`/moderation/reports/${created.body.id}/appeal`)
      .send({ message: 'False positive, this is a puzzle game zip' })
      .expect(201);
    const restored = await mod
      .post(`/moderation/reports/${created.body.id}/restore`)
      .send({ reason: 'Appeal accepted after review' })
      .expect(201);
    expect(restored.body.status).toBe('RESTORED');
    expect(restored.body.moderationState).toBe('CLEAR');
  });
});
