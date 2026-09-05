import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  DeveloperProfilesRepository,
  type DeveloperProfile,
} from '../src/developers/developers.service.js';
import {
  GamesRepository,
  type GamesRepository as GamesRepositoryContract,
} from '../src/games/games.service.js';
import {
  AuthUsersRepository,
  type StoredUser,
} from '../src/auth/auth.service.js';

const testSecret = 'games-e2e-tests-only-a-long-explicit-signing-secret';
const dates = {
  createdAt: new Date('2026-09-05T12:00:00.000Z'),
  updatedAt: new Date('2026-09-05T12:00:00.000Z'),
};

type StoredGame = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  description: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  createdAt: Date;
  updatedAt: Date;
};

describe('Developer profile and game draft HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let games: Map<string, StoredGame>;
  let profiles: Map<string, DeveloperProfile>;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    users = new Map();
    games = new Map();
    profiles = new Map();

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
          if ([...games.values()].some((game) => game.slug === input.slug)) {
            throw { code: 'P2002', meta: { target: ['slug'] } };
          }
          const game: StoredGame = { id: `game-${games.size + 1}`, ...input, ...dates };
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
        async update(id: string, input: { title?: string; description?: string; accessMode?: 'GUEST_ALLOWED' | 'AUTH_REQUIRED' }) {
          const game = games.get(id)!;
          const updated: StoredGame = {
            ...game,
            ...input,
            updatedAt: new Date('2026-09-05T12:05:00.000Z'),
          };
          games.set(id, updated);
          return updated;
        },
      })
      .overrideProvider(DeveloperProfilesRepository)
      .useValue({
        async findByUserId(userId: string) {
          return profiles.get(userId) ?? null;
        },
        async upsert(userId: string, input: DeveloperProfile) {
          profiles.set(userId, input);
          return input;
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

  async function agent(email: string) {
    const instance = request.agent(app.getHttpServer());
    await instance
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return instance;
  }

  async function createGame(owner = 'owner@example.com') {
    const developer = await agent(owner);
    const response = await developer
      .post('/games')
      .send({ title: 'Demo game', slug: 'demo-game' })
      .expect(201);
    return { developer, game: response.body as { id: string } };
  }

  it('returns 401 for an unauthenticated game create request', async () => {
    await request(app.getHttpServer())
      .post('/games')
      .send({ title: 'Demo game', slug: 'demo-game' })
      .expect(401);
  });

  it('creates an owned draft and ignores protected client fields', async () => {
    const developer = await agent('owner@example.com');
    const response = await developer
      .post('/games')
      .send({
        title: 'Demo game',
        slug: 'demo-game',
        visibility: 'PUBLIC',
        moderationState: 'FLAGGED',
        ownerId: 'other-user',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'game-1',
      slug: 'demo-game',
      visibility: 'DRAFT',
      moderationState: 'CLEAR',
    });
    expect(games.get('game-1')).toMatchObject({
      ownerId: 'user-1',
      visibility: 'DRAFT',
      moderationState: 'CLEAR',
    });
  });

  it('returns 409 for a duplicate game slug', async () => {
    const { developer } = await createGame();
    await developer
      .post('/games')
      .send({ title: 'Another game', slug: 'demo-game' })
      .expect(409);
  });

  it('lists only games owned by the authenticated developer', async () => {
    const { developer } = await createGame();
    const otherDeveloper = await agent('other@example.com');
    await otherDeveloper
      .post('/games')
      .send({ title: 'Other game', slug: 'other-game' })
      .expect(201);

    const response = await developer.get('/games/mine').expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 'game-1',
      slug: 'demo-game',
      title: 'Demo game',
      visibility: 'DRAFT',
      moderationState: 'CLEAR',
    });
  });

  it('allows the owner to update a game', async () => {
    const { developer, game } = await createGame();
    await developer
      .patch(`/games/${game.id}`)
      .send({
        title: 'Changed',
        ownerId: 'other-user',
        visibility: 'PUBLIC',
        moderationState: 'FLAGGED',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.title).toBe('Changed');
        expect(response.body.visibility).toBe('DRAFT');
        expect(response.body.moderationState).toBe('CLEAR');
      });
  });

  it('returns 403 when a non-owner tries to update a game', async () => {
    const { game } = await createGame();
    const otherDeveloper = await agent('other@example.com');
    await otherDeveloper
      .patch(`/games/${game.id}`)
      .send({ title: 'Changed' })
      .expect(403);
  });

  it('updates and reads the authenticated profile without exposing email', async () => {
    const developer = await agent('owner@example.com');
    await developer
      .put('/developers/me')
      .send({ displayName: 'Demo developer', bio: 'Makes demos' })
      .expect(200, { displayName: 'Demo developer', bio: 'Makes demos' });
    const response = await developer.get('/developers/me').expect(200);
    expect(response.body).toEqual({
      displayName: 'Demo developer',
      bio: 'Makes demos',
    });
    expect(response.body.email).toBeUndefined();
  });
});
