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
  GamesRepository,
  type GamesRepository as GamesRepositoryContract,
} from '../src/games/games.service.js';
import { MemoryObjectStorage, ObjectStorage } from '../src/games/object-storage.js';
import {
  ProjectsRepository,
  type StoredProject,
} from '../src/games/projects.service.js';
import {
  VersionsRepository,
  type OwnedGame,
  type StoredVersion,
} from '../src/games/versions.repository.js';

const testSecret = 'projects-e2e-tests-only-a-long-explicit-signing-secret';
const dates = {
  createdAt: new Date('2026-09-14T03:00:00.000Z'),
  updatedAt: new Date('2026-09-14T03:00:00.000Z'),
};

type StoredGame = OwnedGame & {
  slug: string;
  title: string;
  description: string;
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  createdAt: Date;
  updatedAt: Date;
};

describe('Online engine project HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let games: Map<string, StoredGame>;
  let projects: Map<string, StoredProject>;
  let versions: Map<string, StoredVersion>;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    users = new Map();
    games = new Map();
    projects = new Map();
    versions = new Map();
    const storage = new MemoryObjectStorage();

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
          return [...users.values()].find((user) => user.email === email) ?? null;
        },
        async findById(id: string) {
          return users.get(id) ?? null;
        },
      })
      .overrideProvider(GamesRepository)
      .useValue({
        async create(input: Parameters<GamesRepositoryContract['create']>[0]) {
          const game: StoredGame = {
            id: `game-${games.size + 1}`,
            activeVersionId: null,
            ...input,
            ...dates,
          };
          games.set(game.id, game);
          return game;
        },
        async findManyByOwner(ownerId: string) {
          return [...games.values()].filter((game) => game.ownerId === ownerId);
        },
        async findUnique(id: string) {
          const game = games.get(id);
          return game ? { id: game.id, ownerId: game.ownerId } : null;
        },
        async update() {
          throw new Error('unused');
        },
      })
      .overrideProvider(ObjectStorage)
      .useValue(storage)
      .overrideProvider(ProjectsRepository)
      .useValue({
        async findGame(id: string) {
          const game = games.get(id);
          return game ? { id: game.id, ownerId: game.ownerId } : null;
        },
        async findByGameId(gameId: string) {
          return [...projects.values()].find((row) => row.gameId === gameId) ?? null;
        },
        async create(input: Omit<StoredProject, 'id' | 'createdAt' | 'updatedAt'>) {
          if ([...projects.values()].some((row) => row.gameId === input.gameId)) {
            throw { code: 'P2002', meta: { target: ['gameId'] } };
          }
          const stored: StoredProject = {
            id: `proj-${projects.size + 1}`,
            ...input,
            ...dates,
          };
          projects.set(stored.id, stored);
          return stored;
        },
        async save(project: StoredProject) {
          const stored = { ...project, updatedAt: new Date('2026-09-14T03:10:00.000Z') };
          projects.set(stored.id, stored);
          return stored;
        },
      })
      .overrideProvider(VersionsRepository)
      .useValue({
        async create(
          input: Omit<StoredVersion, 'id' | 'status' | 'findings' | 'createdAt'> & {
            uploadToken: string;
          },
        ) {
          const stored: StoredVersion = {
            id: `ver-${versions.size + 1}`,
            status: 'UPLOADING',
            findings: '',
            createdAt: dates.createdAt,
            ...input,
          };
          versions.set(stored.id, stored);
          return stored;
        },
        async findById(id: string) {
          return versions.get(id) ?? null;
        },
        async findByUploadToken(token: string) {
          return (
            [...versions.values()].find((version) => version.uploadToken === token) ??
            null
          );
        },
        async save(version: StoredVersion) {
          versions.set(version.id, { ...version });
          return versions.get(version.id)!;
        },
        async findGame(id: string) {
          const game = games.get(id);
          if (!game) return null;
          return {
            id: game.id,
            ownerId: game.ownerId,
            visibility: game.visibility,
            moderationState: game.moderationState,
            activeVersionId: game.activeVersionId,
          };
        },
        async listByGame(gameId: string) {
          return [...versions.values()].filter((row) => row.gameId === gameId);
        },
        async findPublishedRuntime() {
          return null;
        },
        async publish() {
          throw new Error('unused');
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

  async function developer() {
    const instance = request.agent(app.getHttpServer());
    await instance
      .post('/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);
    const created = await instance
      .post('/games')
      .send({ title: 'Orbit Orchard', slug: 'orbit-orchard' })
      .expect(201);
    return { instance, gameId: created.body.id as string };
  }

  it('creates a starter project, previews it, and builds a READY zip', async () => {
    const { instance, gameId } = await developer();
    await instance.get(`/games/${gameId}/project`).expect(404);

    const created = await instance
      .post(`/games/${gameId}/project`)
      .send({ template: 'phaser3-starter' })
      .expect(201);
    expect(created.body.templateId).toBe('phaser3-starter');
    expect(created.body.document.engine).toBe('phaser3');
    await instance
      .post(`/games/${gameId}/project`)
      .send({ template: 'phaser3-starter' })
      .expect(409);

    const preview = await instance.get(`/games/${gameId}/project/preview`).expect(200);
    expect(preview.body.html).toContain('requestAnimationFrame');

    const document = created.body.document;
    document.scenes[0].objects[0].color = '#ff8800';
    const saved = await instance
      .put(`/games/${gameId}/project`)
      .send({ document })
      .expect(200);
    expect(saved.body.document.scenes[0].objects[0].color).toBe('#ff8800');

    const built = await instance.post(`/games/${gameId}/project/build`).expect(201);
    expect(built.body.status).toBe('READY');
    expect(built.body.filename).toBe('engine.zip');
  });

  it('rejects engine access for another developer', async () => {
    const { gameId } = await developer();
    const other = request.agent(app.getHttpServer());
    await other
      .post('/auth/register')
      .send({ email: 'other@example.com', password: 'password123' })
      .expect(201);
    await other
      .post(`/games/${gameId}/project`)
      .send({ template: 'phaser3-starter' })
      .expect(403);
  });
});
