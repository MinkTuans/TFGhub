import { mkdtemp, readdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactStorage } from '../game-artifacts/artifact-storage.js';
import { GameContentService } from './game-content.service.js';
import type {
  GamesRepository,
  StoredGame,
  WorkspaceUpdate,
} from './games.service.js';
import { zipFixture } from '../../test/zip-fixture.js';

const project = {
  sourceType: 'CODE' as const,
  html: '<h1>Playable</h1>',
  css: '',
  javascript: '',
};

describe('GameContentService with real artifacts and ZIP streams', () => {
  let root: string;
  let game: StoredGame;
  let service: GameContentService;
  let storage: ArtifactStorage;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'content-test-'));
    storage = new ArtifactStorage(root);
    game = {
      id: 'game-1',
      ownerId: 'owner-1',
      slug: 'demo',
      title: 'Demo',
      description: '',
      visibility: 'PUBLIC',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      sourceType: 'UPLOAD',
      projectData: null,
      artifactVersion: 1,
      reviewState: 'APPROVED',
      reviewNote: 'Previously reviewed',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const games = {
      async findUnique(id: string) {
        return id === game.id ? game : null;
      },
      async findBySlug(slug: string) {
        return slug === game.slug ? game : null;
      },
      async updateWorkspace(
        id: string,
        expected: Date,
        input: WorkspaceUpdate,
      ) {
        if (id !== game.id || expected !== game.updatedAt) return null;
        game = { ...game, ...input, updatedAt: new Date() };
        return game;
      },
    } as GamesRepository;
    service = new GameContentService(games, storage);
    await storage.install(game.id, 1, [
      {
        path: 'index.html',
        content: 'original',
        contentType: 'text/html; charset=utf-8',
      },
    ]);
  });
  afterEach(async () => {
    async function writable(path: string) {
      await chmod(path, 0o755);
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await writable(join(path, entry.name));
      }
    }
    await writable(root);
    await rm(root, { recursive: true, force: true });
  });

  it('checks ownership before reading source or touching artifact files', async () => {
    await expect(service.workspace(game.id, 'stranger')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.upload(game.id, 'stranger', Buffer.from('bad')),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.build(game.id, 'stranger')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.preview(game.id, 'index.html', { id: 'stranger', role: 'USER' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await readdir(join(root, game.id))).toEqual(['1']);
  });

  it('installs a root document and nested assets, increments version, and resets review', async () => {
    const result = await service.upload(
      game.id,
      'owner-1',
      zipFixture([
        {
          name: 'index.html',
          content: '<script src="assets/game.js"></script>',
        },
        { name: 'assets/', mode: 0o40755, content: '' },
        { name: 'assets/game.js', content: 'window.ready=true' },
      ]),
    );
    expect(result).toMatchObject({
      artifactVersion: 2,
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
    });
    expect(
      (await storage.read(game.id, 2, 'assets/game.js')).content.toString(),
    ).toBe('window.ready=true');
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
  });

  it.each([
    '../escape.js',
    '/absolute.js',
    'C:/absolute.js',
    'assets/../../escape.js',
    'assets\\evil.js',
    'assets/./evil.js',
    'assets//evil.js',
    'bad\u0000.js',
    'game.exe',
    'README',
    '.indieforge-artifact.json',
  ])(
    'rejects unsafe or unsupported entry %j without replacing the current version',
    async (name) => {
      await expect(
        service.upload(
          game.id,
          'owner-1',
          zipFixture([{ name: 'index.html' }, { name }]),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(game.artifactVersion).toBe(1);
      expect(
        (await service.play('demo', 'index.html')).content.toString(),
      ).toBe('original');
      expect(await readdir(join(root, game.id))).toEqual(['1']);
    },
  );

  it.each(
    [
      [{ name: 'nested/index.html' }],
      [{ name: 'index.html', mode: 0o120777 }],
      [{ name: 'index.html', flags: 1 }],
      [{ name: 'index.html' }, { name: 'index.html' }],
      [
        { name: 'index.html' },
        { name: 'asset.js' },
        { name: 'asset.js/child.js' },
      ],
      [
        { name: 'index.html' },
        { name: 'asset.js/child.js' },
        { name: 'asset.js' },
      ],
      [{ name: 'index.html', content: Buffer.alloc(1024), declaredSize: 1 }],
      Array.from({ length: 1001 }, (_, i) => ({
        name: i ? `a${i}.js` : 'index.html',
      })),
    ].map((entries) => ({ entries })),
  )(
    'rejects malformed, missing-root, symbolic, encrypted, duplicate, and excessive entries',
    async ({ entries }) => {
      await expect(
        service.upload(game.id, 'owner-1', zipFixture(entries)),
      ).rejects.toMatchObject({ status: 400 });
      expect(game.artifactVersion).toBe(1);
      expect(await readdir(join(root, game.id))).toEqual(['1']);
    },
  );

  it('rejects compressed and actual expanded byte limits before installation', async () => {
    await expect(
      service.upload(game.id, 'owner-1', Buffer.alloc(25 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ status: 400 });
    const archive = zipFixture([
      { name: 'index.html', content: Buffer.alloc(100 * 1024 * 1024 + 1) },
    ]);
    await expect(
      service.upload(game.id, 'owner-1', archive),
    ).rejects.toMatchObject({ status: 400 });
    expect(game.artifactVersion).toBe(1);
    expect(await readdir(join(root, game.id))).toEqual(['1']);
  }, 15000);

  it('validates source matching, saves private project data, and builds its saved source', async () => {
    await expect(
      service.saveProject(game.id, 'owner-1', project),
    ).rejects.toMatchObject({ status: 400 });
    game.sourceType = 'CODE';
    await expect(
      service.upload(game.id, 'owner-1', zipFixture([{ name: 'index.html' }])),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.build(game.id, 'owner-1')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.saveProject(game.id, 'owner-1', { ...project, javascript: 42 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await service.saveProject(game.id, 'owner-1', project),
    ).toMatchObject({
      projectData: project,
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
      artifactVersion: 1,
    });
    game.visibility = 'PUBLIC';
    game.reviewState = 'APPROVED';
    expect(await service.build(game.id, 'owner-1')).toMatchObject({
      artifactVersion: 2,
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
    });
    const preview = await service.preview(game.id, 'index.html', {
      id: 'owner-1',
      role: 'USER',
    });
    expect(preview.content.toString()).toContain('Playable');
  });

  it('allows owner and moderator previews and denies unsafe/missing artifact paths', async () => {
    for (const user of [
      { id: 'owner-1', role: 'USER' as const },
      { id: 'mod', role: 'MODERATOR' as const },
      { id: 'admin', role: 'ADMIN' as const },
    ]) {
      expect(
        (await service.preview(game.id, 'index.html', user)).content.toString(),
      ).toBe('original');
    }
    for (const path of [
      '../index.html',
      '/index.html',
      'missing.js',
      '.indieforge-artifact.json',
    ]) {
      await expect(service.play('demo', path)).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it('enforces guest/session access and all public artifact gates', async () => {
    game.accessMode = 'AUTH_REQUIRED';
    await expect(service.play('demo', 'index.html')).rejects.toMatchObject({
      status: 401,
    });
    expect(
      (
        await service.play('demo', 'index.html', {
          id: 'visitor',
          role: 'USER',
        })
      ).content.toString(),
    ).toBe('original');
    for (const patch of [
      { visibility: 'DRAFT' },
      { visibility: 'UNLISTED' },
      { reviewState: 'DRAFT' },
      { reviewState: 'PENDING' },
      { reviewState: 'REJECTED' },
      { moderationState: 'FLAGGED' },
      { moderationState: 'QUARANTINED' },
      { artifactVersion: 0 },
    ]) {
      const previous = game;
      game = { ...game, ...patch } as StoredGame;
      await expect(service.play('demo', 'index.html')).rejects.toMatchObject({
        status: 404,
      });
      game = previous;
    }
  });

  it('returns 503 on storage failure without changing database or old artifact', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    await storage.install(game.id, 2, [
      { path: 'index.html', content: 'collision', contentType: 'text/html' },
    ]);
    await expect(service.build(game.id, 'owner-1')).rejects.toMatchObject({
      status: 503,
    });
    expect(game).toMatchObject({
      artifactVersion: 1,
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
    });
    expect((await service.play('demo', 'index.html')).content.toString()).toBe(
      'original',
    );
  });
});
