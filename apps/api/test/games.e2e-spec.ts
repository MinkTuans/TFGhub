import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { chromium, type Request as BrowserRequest } from '@playwright/test';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { zipFixture } from './zip-fixture.js';
import { mkdtemp, chmod, readdir, rm, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactStorage } from '../src/game-artifacts/artifact-storage.js';
import type {
  StoredGame,
  WorkspaceUpdate,
} from '../src/games/games.service.js';
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

describe('Developer profile and game draft HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let games: Map<string, StoredGame>;
  let profiles: Map<string, DeveloperProfile>;
  let storageRoot: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    users = new Map();
    games = new Map();
    profiles = new Map();
    storageRoot = await mkdtemp(join(tmpdir(), 'games-http-'));

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ArtifactStorage)
      .useValue(new ArtifactStorage(storageRoot))
      .overrideProvider(AuthUsersRepository)
      .useValue({
        async create(input: { email: string; passwordHash: string }) {
          const id = `user-${users.size + 1}`;
          const user: StoredUser = { ...input, id, role: 'USER' };
          users.set(id, user);
          return user;
        },
        async findByEmail(email: string) {
          return (
            [...users.values()].find((user) => user.email === email) ?? null
          );
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
          const game: StoredGame = {
            id: `game-${games.size + 1}`,
            sourceType: 'UPLOAD',
            reviewState: 'DRAFT',
            projectData: null,
            artifactVersion: 0,
            reviewNote: null,
            submittedAt: null,
            reviewedAt: null,
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
          return game ?? null;
        },
        async lockForArtifactReconciliation(id: string) {
          return games.get(id) ?? null;
        },
        async findBySlug(slug: string) {
          return [...games.values()].find((game) => game.slug === slug) ?? null;
        },
        async updateWorkspace(
          id: string,
          expected: Date,
          input: WorkspaceUpdate,
        ) {
          const game = games.get(id)!;
          if (game.updatedAt !== expected) return null;
          const updated = { ...game, ...input, updatedAt: new Date() };
          games.set(id, updated);
          return updated;
        },
        async update(
          id: string,
          input: {
            title?: string;
            description?: string;
            accessMode?: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
          },
        ) {
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
    async function writable(path: string) {
      await chmod(path, 0o755);
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await writable(join(path, entry.name));
      }
    }
    if (storageRoot) {
      await writable(storageRoot);
      await rm(storageRoot, { recursive: true, force: true });
    }
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

  it('opens an owner workspace and denies other users', async () => {
    const { developer, game } = await createGame();
    await developer
      .get(`/games/${game.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          sourceType: 'UPLOAD',
          artifactVersion: 0,
          projectData: null,
          reviewState: 'DRAFT',
        });
      });
    await request(app.getHttpServer()).get(`/games/${game.id}`).expect(401);
    const other = await agent('other@example.com');
    await other.get(`/games/${game.id}`).expect(403);
  });

  it('runs authenticated nested classic JS inside the exact opaque sandbox in Chromium', async () => {
    const { developer, game } = await createGame();
    await developer
      .post(`/games/${game.id}/upload`)
      .attach(
        'game',
        zipFixture([
          {
            name: 'index.html',
            content:
              '<div id="status">Waiting</div><script src="assets/game.js"></script>',
          },
          {
            name: 'assets/game.js',
            content:
              'document.getElementById("status").textContent="Nested classic ready"',
          },
        ]),
        'game.zip',
      )
      .expect(201);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
    try {
      const context = await browser.newContext();
      await context.request.post(`${origin}/auth/login`, {
        data: { email: 'owner@example.com', password: 'password123' },
      });
      const page = await context.newPage();
      const requests: BrowserRequest[] = [];
      page.on('request', (request) => requests.push(request));
      await page.goto(origin);
      await page.setContent(
        `<iframe sandbox="allow-scripts allow-pointer-lock" src="${origin}/games/${game.id}/preview/index.html"></iframe>`,
      );
      await page
        .frameLocator('iframe')
        .locator('#status')
        .filter({ hasText: 'Nested classic ready' })
        .waitFor({ timeout: 5000 });
      const nested = requests.find((request) =>
        request.url().endsWith('/assets/game.js'),
      )!;
      expect(nested.url()).toContain('/game-content/');
      expect((await nested.allHeaders()).cookie).toBeUndefined();
    } finally {
      await browser.close();
    }
  }, 20000);

  it('runs guest nested modules and a local font with Origin:null in Chromium without widening API CORS', async () => {
    const { developer, game } = await createGame();
    const require = createRequire(import.meta.url);
    const databaseRequire = createRequire(
      require.resolve('@indieforge/database'),
    );
    const fontDirectory = join(
      dirname(databaseRequire.resolve('prisma/package.json')),
      'build/public/assets',
    );
    const fontName = (await readdir(fontDirectory)).find((file) =>
      /^inter-latin-400-normal\..*\.woff2$/.test(file),
    )!;
    const font = await readFile(join(fontDirectory, fontName));
    await developer
      .post(`/games/${game.id}/upload`)
      .attach(
        'game',
        zipFixture([
          {
            name: 'index.html',
            content:
              '<style>@font-face{font-family:Fixture;src:url("fonts/fixture.woff2")}</style><div id="module">Waiting</div><div id="font">Waiting</div><script type="module" src="assets/main.js"></script>',
          },
          {
            name: 'assets/main.js',
            content:
              'import {value} from "./nested/value.js";document.getElementById("module").textContent=value;document.fonts.load("16px Fixture").then(()=>document.getElementById("font").textContent="Font ready")',
          },
          {
            name: 'assets/nested/value.js',
            content: 'export const value="Nested module ready"',
          },
          { name: 'fonts/fixture.woff2', content: font },
        ]),
        'game.zip',
      )
      .expect(201);
    Object.assign(games.get(game.id)!, {
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
    });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
    try {
      const page = await browser.newPage();
      const requests: BrowserRequest[] = [];
      page.on('request', (request) => requests.push(request));
      await page.goto(origin);
      await page.setContent(
        `<iframe sandbox="allow-scripts allow-pointer-lock" src="${origin}/play/demo-game/index.html"></iframe>`,
      );
      await page
        .frameLocator('iframe')
        .locator('#module')
        .filter({ hasText: 'Nested module ready' })
        .waitFor({ timeout: 5000 });
      await page
        .frameLocator('iframe')
        .locator('#font')
        .filter({ hasText: 'Font ready' })
        .waitFor({ timeout: 5000 });
      for (const suffix of [
        '/assets/nested/value.js',
        '/fonts/fixture.woff2',
      ]) {
        const nested = requests.find((request) =>
          request.url().endsWith(suffix),
        )!;
        const headers = await nested.allHeaders();
        expect(headers.origin).toBe('null');
        expect(headers.cookie).toBeUndefined();
      }
      await request(app.getHttpServer())
        .get('/games/mine')
        .set('Origin', 'null')
        .expect(401)
        .expect((response) => {
          expect(response.headers['access-control-allow-origin']).toBe(
            'http://localhost:3000',
          );
        });
    } finally {
      await browser.close();
    }
  }, 20000);

  it('uploads through the multipart boundary, previews nested files with isolation headers, and gates public play', async () => {
    const { developer, game } = await createGame();
    const archive = zipFixture([
      { name: 'index.html', content: '<script src="assets/game.js"></script>' },
      { name: 'assets/game.js', content: 'window.ready=true' },
    ]);
    const uploaded = await developer
      .post(`/games/${game.id}/upload`)
      .attach('game', archive, 'game.zip');
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const preview = await developer
      .get(`/games/${game.id}/preview/`)
      .expect(302);
    const previewUrl = new URL(
      preview.headers.location,
      `http://api/games/${game.id}/preview/`,
    ).pathname;
    expect(previewUrl).toMatch(/^\/game-content\/[^/]+\/index\.html$/);
    expect(
      new URL(
        preview.headers.location,
        `https://site/api/games/${game.id}/preview/`,
      ).pathname,
    ).toBe(`/api${previewUrl}`);
    await request(app.getHttpServer())
      .get(previewUrl)
      .set('Origin', 'null')
      .expect(200)
      .expect((response) => {
        expect(response.headers['content-type']).toBe(
          'text/html; charset=utf-8',
        );
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['access-control-allow-origin']).toBe('*');
        expect(
          response.headers['access-control-allow-credentials'],
        ).toBeUndefined();
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['content-security-policy']).toContain(
          'sandbox allow-scripts allow-pointer-lock',
        );
        expect(response.headers['content-security-policy']).toContain(
          "connect-src 'none'",
        );
        expect(response.headers['content-security-policy']).not.toContain(
          'allow-same-origin',
        );
        expect(response.headers['content-security-policy']).not.toContain(
          "'self'",
        );
        expect(response.headers['content-security-policy']).toContain(
          previewUrl.slice(0, -'index.html'.length),
        );
      });
    await request(app.getHttpServer())
      .get(previewUrl.replace('index.html', 'assets/game.js'))
      .expect(200)
      .expect((response) => {
        expect(response.text).toBe('window.ready=true');
        expect(response.headers['content-type']).toBe(
          'text/javascript; charset=utf-8',
        );
      });
    await request(app.getHttpServer())
      .get(`/games/${game.id}/preview/index.html`)
      .expect(401);
    const other = await agent('other@example.com');
    await other.get(`/games/${game.id}/preview/index.html`).expect(403);
    await request(app.getHttpServer())
      .get('/play/demo-game/index.html')
      .expect(404);
    Object.assign(games.get(game.id)!, {
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
    });
    const play = await request(app.getHttpServer())
      .get('/play/demo-game/')
      .expect(302);
    const playUrl = new URL(play.headers.location, 'http://api/play/demo-game/')
      .pathname;
    await request(app.getHttpServer()).get(playUrl).expect(200);
    Object.assign(games.get(game.id)!, { accessMode: 'AUTH_REQUIRED' });
    await request(app.getHttpServer())
      .get('/play/demo-game/index.html')
      .expect(401);
    await request(app.getHttpServer()).get(playUrl).expect(404);
    const authorized = await other
      .get('/play/demo-game/index.html')
      .expect(302);
    const authorizedUrl = new URL(
      authorized.headers.location,
      'http://api/play/demo-game/index.html',
    ).pathname;
    await request(app.getHttpServer()).get(authorizedUrl).expect(200);
    Object.assign(games.get(game.id)!, { moderationState: 'QUARANTINED' });
    await request(app.getHttpServer()).get(authorizedUrl).expect(404);
    const capabilityToken = previewUrl.split('/')[2]!;
    await request(app.getHttpServer())
      .get('/games/mine')
      .set('Cookie', `indieforge_access=${capabilityToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/play/demo-game/index.html')
      .set('Cookie', 'indieforge_access=invalid')
      .expect(401);
  });

  it('allows multipart only for the exact POST upload route and trusted origins', async () => {
    const { developer, game } = await createGame();
    const archive = zipFixture([{ name: 'index.html' }]);
    await developer
      .post(`/games/${game.id}/upload`)
      .set('Origin', 'http://evil.example')
      .attach('game', archive, 'game.zip')
      .expect(403);
    await developer
      .post(`/games/${game.id}/upload`)
      .set('Origin', 'null')
      .attach('game', archive, 'game.zip')
      .expect(403);
    await developer
      .post(`/games/${game.id}/upload`)
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('game', archive, 'game.zip')
      .expect(403);
    await developer
      .post('/games')
      .attach('game', archive, 'game.zip')
      .expect(415);
    await developer
      .put(`/games/${game.id}/upload`)
      .attach('game', archive, 'game.zip')
      .expect(415);
    await developer
      .post(`/games/${game.id}/upload/extra`)
      .attach('game', archive, 'game.zip')
      .expect(415);
    await request(app.getHttpServer())
      .post(`/games/${game.id}/upload`)
      .attach('game', archive, 'game.zip')
      .expect(401);
    const other = await agent('other@example.com');
    await other
      .post(`/games/${game.id}/upload`)
      .attach('game', archive, 'game.zip')
      .expect(403);
    await developer
      .post(`/games/${game.id}/upload`)
      .attach('wrong', archive, 'game.zip')
      .expect(400);
    await developer
      .post(`/games/${game.id}/upload`)
      .attach('game', archive, 'game.zip')
      .attach('game', archive, 'second.zip')
      .expect(400);
    await developer
      .post(`/games/${game.id}/upload`)
      .field('extra', 'value')
      .attach('game', archive, 'game.zip')
      .expect(400);
    await developer.post(`/games/${game.id}/upload`).send({}).expect(400);
    await developer
      .post(`/games/${game.id}/upload`)
      .set('Origin', 'http://localhost:3000')
      .attach('game', archive, 'game.zip')
      .expect(201);
  });

  it('saves and builds validated code projects through the JSON API', async () => {
    const developer = await agent('owner@example.com');
    const response = await developer
      .post('/games')
      .send({ title: 'Code', slug: 'code-game', sourceType: 'CODE' })
      .expect(201);
    const id = response.body.id as string;
    await developer
      .put(`/games/${id}/project`)
      .send({
        sourceType: 'CODE',
        html: '<h1>Code</h1>',
        css: '',
        javascript: '',
      })
      .expect(200);
    await developer
      .post(`/games/${id}/build`)
      .send({})
      .expect(201)
      .expect((result) => {
        expect(result.body).toMatchObject({
          artifactVersion: 1,
          reviewState: 'DRAFT',
          visibility: 'DRAFT',
        });
      });
    await developer.get(`/games/${id}/preview/index.html`).expect(302);
    await developer
      .put(`/games/${id}/project`)
      .send({ sourceType: 'STORY', scenes: [] })
      .expect(400);
  });

  it('accepts schema-bounded projects larger than the default JSON parser limit', async () => {
    const developer = await agent('owner@example.com');
    const response = await developer
      .post('/games')
      .send({ title: 'Code', slug: 'code-game', sourceType: 'CODE' })
      .expect(201);
    await developer
      .put(`/games/${response.body.id}/project`)
      .send({
        sourceType: 'CODE',
        html: 'x'.repeat(50_000),
        css: ' '.repeat(50_000),
        javascript: ' '.repeat(50_000),
      })
      .expect(200);
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
    expect(response.body[0]).toEqual({
      id: 'game-1',
      slug: 'demo-game',
      title: 'Demo game',
      description: '',
      visibility: 'DRAFT',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      sourceType: 'UPLOAD',
      reviewState: 'DRAFT',
      projectData: null,
      artifactVersion: 0,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
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
        expect(response.body).toEqual({
          id: 'game-1',
          slug: 'demo-game',
          title: 'Changed',
          description: '',
          visibility: 'DRAFT',
          accessMode: 'GUEST_ALLOWED',
          moderationState: 'CLEAR',
          createdAt: '2026-09-05T12:00:00.000Z',
          updatedAt: '2026-09-05T12:05:00.000Z',
          sourceType: 'UPLOAD',
          reviewState: 'DRAFT',
          projectData: null,
          artifactVersion: 0,
          reviewNote: null,
          submittedAt: null,
          reviewedAt: null,
        });
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
