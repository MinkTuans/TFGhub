import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
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
  VersionsRepository,
  type OwnedGame,
  type StoredVersion,
} from '../src/games/versions.service.js';

const testSecret = 'versions-e2e-tests-only-a-long-explicit-signing-secret';
const dates = {
  createdAt: new Date('2026-09-05T12:00:00.000Z'),
  updatedAt: new Date('2026-09-05T12:00:00.000Z'),
};

type StoredGame = OwnedGame & {
  slug: string;
  title: string;
  description: string;
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  createdAt: Date;
  updatedAt: Date;
};

async function html5Zip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', '<html><body>play</body></html>');
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

describe('Game version upload and publish HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let games: Map<string, StoredGame>;
  let versions: Map<string, StoredVersion>;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    users = new Map();
    games = new Map();
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
      .overrideProvider(VersionsRepository)
      .useValue({
        async create(input: Omit<StoredVersion, 'id' | 'status' | 'findings' | 'createdAt'> & { uploadToken: string }) {
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
        async findPublishedRuntime(slug: string) {
          const game = [...games.values()].find(
            (item) =>
              item.slug === slug &&
              item.visibility === 'PUBLIC' &&
              item.activeVersionId,
          );
          if (!game?.activeVersionId) return null;
          const version = versions.get(game.activeVersionId);
          if (!version || version.status !== 'READY') return null;
          return { storageKey: version.storageKey };
        },
        async publish(gameId: string, versionId: string) {
          const game = games.get(gameId)!;
          game.visibility = 'PUBLIC';
          game.activeVersionId = versionId;
          return {
            id: game.id,
            slug: game.slug,
            title: game.title,
            description: game.description,
            visibility: game.visibility,
            accessMode: game.accessMode,
            moderationState: game.moderationState,
            createdAt: game.createdAt.toISOString(),
            updatedAt: new Date('2026-09-05T12:10:00.000Z').toISOString(),
          };
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

  it('uploads, scans, and publishes a READY HTML5 zip', async () => {
    const { instance, gameId } = await developer();
    const archive = await html5Zip();
    const checksum = createHash('sha256').update(archive).digest('hex');

    const created = await instance
      .post(`/games/${gameId}/versions`)
      .send({ filename: 'orbit.zip', byteSize: archive.length, checksumSha256: checksum })
      .expect(201);
    expect(created.body.status).toBe('UPLOADING');
    expect(created.body.uploadUrl).toMatch(/\/uploads\//);

    await instance
      .put(created.body.uploadUrl.replace('http://localhost:3001', ''))
      .set('Content-Type', 'application/octet-stream')
      .send(archive)
      .expect(200);

    const completed = await instance
      .post(`/games/${gameId}/versions/${created.body.id}/complete`)
      .send({ checksumSha256: checksum })
      .expect(201);
    expect(completed.body.status).toBe('READY');

    const published = await instance
      .post(`/games/${gameId}/publish`)
      .send({ versionId: created.body.id })
      .expect(201);
    expect(published.body.visibility).toBe('PUBLIC');

    const page = await instance.get('/runtime/orbit-orchard/index.html').expect(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['content-security-policy']).toContain('frame-ancestors');
    expect(page.text).toContain('play');
    await instance.get('/runtime/missing-game/index.html').expect(404);
  });
});
