import { mkdtemp, readdir, rm, chmod, stat } from 'node:fs/promises';
import { JwtService } from '@nestjs/jwt';
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('GameContentService with real artifacts and ZIP streams', () => {
  let root: string;
  let game: StoredGame;
  let service: GameContentService;
  let storage: ArtifactStorage;
  let finalization:
    | 'ok'
    | 'fail'
    | 'commit-then-fail'
    | 'fail-and-offline'
    | 'fail-before-commit';
  let offline: boolean;
  let tokens: JwtService;
  let games: GamesRepository;
  let pendingCommit: ReturnType<typeof deferred> | undefined;
  let finishCommit: (() => void) | undefined;
  let reconciliationRequested: ReturnType<typeof deferred>;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'content-test-'));
    storage = new ArtifactStorage(root);
    finalization = 'ok';
    offline = false;
    pendingCommit = undefined;
    finishCommit = undefined;
    reconciliationRequested = deferred();
    tokens = new JwtService({ secret: 'test-only-capability-signing-secret' });
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
      artifactReady: true,
      reviewState: 'APPROVED',
      reviewNote: 'Previously reviewed',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    games = {
      async findUnique(id: string) {
        if (offline) throw new Error('Database unavailable');
        return id === game.id ? game : null;
      },
      async findBySlug(slug: string) {
        return slug === game.slug ? game : null;
      },
      async lockForArtifactReconciliation(id: string) {
        reconciliationRequested.resolve();
        await pendingCommit?.promise;
        if (offline) throw new Error('Database unavailable');
        return id === game.id ? game : null;
      },
      async updateWorkspace(
        id: string,
        expected: Date,
        input: WorkspaceUpdate,
      ) {
        if (id !== game.id || expected !== game.updatedAt) return null;
        if (finalization === 'fail') throw new Error('Finalization failed');
        if (finalization === 'fail-and-offline') {
          offline = true;
          throw new Error('Database unavailable');
        }
        if (finalization === 'fail-before-commit') {
          pendingCommit = deferred();
          finishCommit = () => {
            game = { ...game, ...input, updatedAt: new Date() };
            pendingCommit!.resolve();
          };
          throw new Error('Connection lost while commit is still in flight');
        }
        game = { ...game, ...input, updatedAt: new Date() };
        if (finalization === 'commit-then-fail')
          throw new Error('Commit response lost');
        return game;
      },
    } as GamesRepository;
    service = new GameContentService(games, storage, tokens);
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

  async function previewFile(
    gameId: string,
    path: string,
    user: Parameters<GameContentService['previewCapability']>[1],
  ) {
    const capability = await service.previewCapability(gameId, user);
    return service.capabilityFile(capability.token, path);
  }

  async function playFile(
    slug: string,
    path: string,
    user?: Parameters<GameContentService['playCapability']>[1],
  ) {
    const capability = await service.playCapability(slug, user);
    return service.capabilityFile(capability.token, path);
  }

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
      previewFile(game.id, 'index.html', { id: 'stranger', role: 'USER' }),
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
      artifactReady: true,
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
      expect((await playFile('demo', 'index.html')).content.toString()).toBe(
        'original',
      );
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
    (game as StoredGame & { artifactReady: boolean }).artifactReady = true;
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
      artifactReady: false,
    });
    game.visibility = 'PUBLIC';
    game.reviewState = 'APPROVED';
    expect(await service.build(game.id, 'owner-1')).toMatchObject({
      artifactVersion: 2,
      artifactReady: true,
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
    });
    const preview = await previewFile(game.id, 'index.html', {
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
        (await previewFile(game.id, 'index.html', user)).content.toString(),
      ).toBe('original');
    }
    for (const path of [
      '../index.html',
      '/index.html',
      'missing.js',
      '.indieforge-artifact.json',
    ]) {
      await expect(playFile('demo', path)).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it('enforces guest/session access and all public artifact gates', async () => {
    game.accessMode = 'AUTH_REQUIRED';
    await expect(playFile('demo', 'index.html')).rejects.toMatchObject({
      status: 401,
    });
    expect(
      (
        await playFile('demo', 'index.html', {
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
      await expect(playFile('demo', 'index.html')).rejects.toMatchObject({
        status: 404,
      });
      game = previous;
    }
  });

  it('returns 503 on storage failure without changing database or old artifact', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    await chmod(join(root, game.id), 0o555);
    await expect(service.build(game.id, 'owner-1')).rejects.toMatchObject({
      status: 503,
    });
    expect(game).toMatchObject({
      artifactVersion: 1,
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
    });
    expect((await playFile('demo', 'index.html')).content.toString()).toBe(
      'original',
    );
  });

  it('recovers a failed finalization and retries while preserving the immutable prior version', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    finalization = 'fail';
    await expect(service.build(game.id, 'owner-1')).rejects.toMatchObject({
      status: 503,
    });
    expect(await readdir(join(root, game.id))).toEqual(['1']);
    finalization = 'ok';
    expect(await service.build(game.id, 'owner-1')).toMatchObject({
      artifactVersion: 2,
    });
    expect(
      (await storage.read(game.id, 2, 'index.html')).content.toString(),
    ).toContain('Playable');
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
    expect((await stat(join(root, game.id, '1'))).mode & 0o222).toBe(0);
  });

  it('keeps committed bytes when the database commit response is lost', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    finalization = 'commit-then-fail';
    expect(await service.build(game.id, 'owner-1')).toMatchObject({
      artifactVersion: 2,
    });
    expect(
      (await storage.read(game.id, 2, 'index.html')).content.toString(),
    ).toContain('Playable');
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
  });

  it('waits for an in-flight finalization commit before deciding whether its bytes are unreferenced', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    finalization = 'fail-before-commit';
    const outcome = service.build(game.id, 'owner-1').then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      const reached = await Promise.race([
        reconciliationRequested.promise.then(() => 'locked'),
        outcome.then(() => 'finished without waiting'),
      ]);
      expect(reached).toBe('locked');
      // An ordinary READ COMMITTED lookup still sees version 1 while the
      // original transaction holds the row and has not completed its commit.
      expect((await games.findUnique(game.id))?.artifactVersion).toBe(1);
      expect(
        (await storage.read(game.id, 2, 'index.html')).content.toString(),
      ).toContain('Playable');
    } finally {
      finishCommit?.();
    }
    expect(await outcome).toMatchObject({ value: { artifactVersion: 2 } });
    expect(game.artifactVersion).toBe(2);
    expect(
      (await storage.read(game.id, 2, 'index.html')).content.toString(),
    ).toContain('Playable');
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
  });

  it('waits for an in-flight commit on a version collision and preserves the original committed bytes', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    await storage.install(game.id, 2, [
      {
        path: 'index.html',
        content: 'in-flight artifact',
        contentType: 'text/html',
      },
    ]);
    pendingCommit = deferred();
    finishCommit = () => {
      game = {
        ...game,
        artifactVersion: 2,
        visibility: 'DRAFT',
        reviewState: 'DRAFT',
        updatedAt: new Date(),
      };
      pendingCommit!.resolve();
    };
    const outcome = service.build(game.id, 'owner-1').then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      const reached = await Promise.race([
        reconciliationRequested.promise.then(() => 'locked'),
        outcome.then(() => 'finished without waiting'),
      ]);
      expect(reached).toBe('locked');
      expect((await games.findUnique(game.id))?.artifactVersion).toBe(1);
      expect(
        (await storage.read(game.id, 2, 'index.html')).content.toString(),
      ).toBe('in-flight artifact');
    } finally {
      finishCommit();
    }
    expect(await outcome).toMatchObject({ error: { status: 409 } });
    expect(game.artifactVersion).toBe(2);
    expect(
      (await storage.read(game.id, 2, 'index.html')).content.toString(),
    ).toBe('in-flight artifact');
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
  });

  it('preserves uncertain bytes while offline then reconciles the orphan on a later retry', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    finalization = 'fail-and-offline';
    await expect(service.build(game.id, 'owner-1')).rejects.toMatchObject({
      status: 503,
    });
    expect(await readdir(join(root, game.id))).toEqual(['1', '2']);
    offline = false;
    finalization = 'ok';
    expect(await service.build(game.id, 'owner-1')).toMatchObject({
      artifactVersion: 2,
    });
    expect(
      (await storage.read(game.id, 1, 'index.html')).content.toString(),
    ).toBe('original');
  });

  it('serializes simultaneous builds so each installs a distinct increasing version', async () => {
    game.sourceType = 'CODE';
    game.projectData = project;
    const builds = await Promise.all([
      service.build(game.id, 'owner-1'),
      service.build(game.id, 'owner-1'),
    ]);
    expect(builds.map((built) => built.artifactVersion)).toEqual([2, 3]);
    expect(await readdir(join(root, game.id))).toEqual(['1', '2', '3']);
  });

  it('mints a short-lived, version-bound preview capability only for an owner or moderator', async () => {
    await expect(
      service.previewCapability(game.id, { id: 'stranger', role: 'USER' }),
    ).rejects.toMatchObject({ status: 403 });
    const capability = await service.previewCapability(game.id, {
      id: 'owner-1',
      role: 'USER',
    });
    expect(
      (
        await service.capabilityFile(capability.token, 'index.html')
      ).content.toString(),
    ).toBe('original');
    const payload = tokens.decode(capability.token);
    expect(payload).toMatchObject({
      gameId: 'game-1',
      artifactVersion: 1,
      purpose: 'preview',
    });
    expect(payload.exp - payload.iat).toBe(300);
    const moderator = await service.previewCapability(game.id, {
      id: 'moderator',
      role: 'MODERATOR',
    });
    expect(
      (
        await service.capabilityFile(moderator.token, 'index.html')
      ).content.toString(),
    ).toBe('original');
    await storage.install(game.id, 2, [
      { path: 'index.html', content: 'new version', contentType: 'text/html' },
    ]);
    game.artifactVersion = 2;
    await expect(
      service.capabilityFile(capability.token, 'index.html'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects expired, forged, session-purpose, and path-escaping capability requests', async () => {
    const capability = await service.previewCapability(game.id, {
      id: 'owner-1',
      role: 'USER',
    });
    const expired = await tokens.signAsync(
      {
        gameId: game.id,
        artifactVersion: 1,
        purpose: 'preview',
        authenticated: true,
      },
      {
        expiresIn: -1,
        audience: 'game-content',
        issuer: 'indieforge-game-content',
      },
    );
    const session = await tokens.signAsync(
      { sub: 'owner-1', role: 'USER' },
      { expiresIn: 300 },
    );
    const forged = await new JwtService({
      secret: 'different-signing-secret',
    }).signAsync(
      {
        gameId: game.id,
        artifactVersion: 1,
        purpose: 'preview',
        authenticated: true,
      },
      {
        expiresIn: 300,
        audience: 'game-content',
        issuer: 'indieforge-game-content',
      },
    );
    for (const token of ['forged', forged, expired, session]) {
      await expect(
        service.capabilityFile(token, 'index.html'),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      service.capabilityFile(capability.token, '../index.html'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('enforces play authorization when minting and revokes public capabilities when approval or access changes', async () => {
    const guest = await service.playCapability('demo');
    expect(
      (
        await service.capabilityFile(guest.token, 'index.html')
      ).content.toString(),
    ).toBe('original');
    game.accessMode = 'AUTH_REQUIRED';
    await expect(service.playCapability('demo')).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.capabilityFile(guest.token, 'index.html'),
    ).rejects.toMatchObject({ status: 404 });
    const signedIn = await service.playCapability('demo', {
      id: 'visitor',
      role: 'USER',
    });
    expect(
      (
        await service.capabilityFile(signedIn.token, 'index.html')
      ).content.toString(),
    ).toBe('original');
    game.reviewState = 'DRAFT';
    await expect(
      service.capabilityFile(signedIn.token, 'index.html'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.playCapability('demo', { id: 'visitor', role: 'USER' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
