import { chmod, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamesRepository, type StoredGame } from '../games/games.service.js';
import { CoverStorage } from './cover-storage.js';
import { GameCoverService } from './game-cover.service.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const webp = Buffer.from('RIFF0000WEBPcover');
const jpeg = Buffer.from([255, 216, 255, 224]);
const file = (buffer = png, mimetype = 'image/png') => ({ buffer, mimetype });

describe('GameCoverService', () => {
  let root: string;
  let storage: CoverStorage;
  let service: GameCoverService;
  let row: StoredGame;
  let update: GamesRepository['updateCover'];
  let reconcile: () => Promise<StoredGame | null>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cover-service-'));
    storage = new CoverStorage(root);
    row = {
      id: 'game-1',
      ownerId: 'owner-1',
      slug: 'demo',
      title: 'Demo',
      description: '',
      visibility: 'PUBLIC',
      accessMode: 'AUTH_REQUIRED',
      moderationState: 'CLEAR',
      sourceType: 'UPLOAD',
      reviewState: 'APPROVED',
      projectData: null,
      artifactVersion: 3,
      artifactReady: true,
      coverVersion: 0,
      coverContentType: null,
      viewportWidth: 16,
      viewportHeight: 9,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
      reviewNote: null,
      submittedAt: new Date('2026-09-01'),
      reviewedAt: new Date('2026-09-01'),
    };
    update = async (
      id,
      ownerId,
      expectedUpdatedAt,
      expectedCoverVersion,
      input,
    ) => {
      if (
        row.id !== id ||
        row.ownerId !== ownerId ||
        row.updatedAt.getTime() !== expectedUpdatedAt.getTime() ||
        row.coverVersion !== expectedCoverVersion
      )
        return null;
      row = {
        ...row,
        ...input,
        updatedAt: new Date(row.updatedAt.getTime() + 1),
      };
      return { ...row };
    };
    reconcile = async () => ({ ...row });
    const repository = {
      async findUnique(id: string) {
        return id === row.id ? { ...row } : null;
      },
      async findBySlug(slug: string) {
        return slug === row.slug ? { ...row } : null;
      },
      lockForArtifactReconciliation: () => reconcile(),
      updateCover: (...args: Parameters<GamesRepository['updateCover']>) =>
        update(...args),
    } as GamesRepository;
    service = new GameCoverService(repository, storage);
  });

  afterEach(async () => {
    async function unseal(path: string) {
      await chmod(path, 0o755);
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await unseal(join(path, entry.name));
      }
    }
    await unseal(root);
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    [png, 'image/png'],
    [jpeg, 'image/jpeg'],
    [webp, 'image/webp'],
  ] as const)(
    'stores validated bytes with their detected type (%s, %s)',
    async (bytes, mime) => {
      const summary = await service.upload(
        'game-1',
        'owner-1',
        file(bytes, mime),
      );
      expect(summary).toMatchObject({
        coverVersion: 1,
        coverContentType: mime,
        reviewState: 'APPROVED',
        visibility: 'PUBLIC',
        artifactVersion: 3,
      });
      expect(await storage.read('game-1', 1)).toEqual({
        content: bytes,
        contentType: mime,
      });
    },
  );

  it.each([
    undefined,
    file(Buffer.from('not an image')),
    file(png, 'image/jpeg'),
    file(Buffer.from('<svg/>'), 'image/svg+xml'),
  ])('rejects invalid cover input before storage (%s)', async (input) => {
    await expect(
      service.upload('game-1', 'owner-1', input),
    ).rejects.toMatchObject({ status: 400 });
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects oversized covers before storage', async () => {
    await expect(
      service.upload(
        'game-1',
        'owner-1',
        file(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)])),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects high-bit lookalikes of the WebP signature', async () => {
    const bytes = Buffer.from(webp);
    bytes[0] = 0xd2;
    await expect(
      service.upload('game-1', 'owner-1', file(bytes, 'image/webp')),
    ).rejects.toMatchObject({ status: 400 });
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects nonowners and missing games before storage', async () => {
    await expect(
      service.upload('game-1', 'other', file()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.upload('missing', 'owner-1', file()),
    ).rejects.toMatchObject({ status: 403 });
    expect(await readdir(root)).toEqual([]);
  });

  it('serializes simultaneous uploads into distinct current versions', async () => {
    const results = await Promise.all([
      service.upload('game-1', 'owner-1', file()),
      service.upload('game-1', 'owner-1', file(webp, 'image/webp')),
    ]);
    expect(results.map((result) => result.coverVersion)).toEqual([1, 2]);
    expect(await service.readOwned('game-1', 'owner-1', 2)).toEqual({
      content: webp,
      contentType: 'image/webp',
    });
    await expect(
      service.readOwned('game-1', 'owner-1', 1),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('removes only its unreferenced next version after database failure and allows retry', async () => {
    await service.upload('game-1', 'owner-1', file());
    const workingUpdate = update;
    update = async () => {
      throw new Error('database down');
    };
    await expect(
      service.upload('game-1', 'owner-1', file(webp, 'image/webp')),
    ).rejects.toMatchObject({ status: 503 });
    expect(await storage.read('game-1', 1)).toEqual({
      content: png,
      contentType: 'image/png',
    });
    await expect(storage.read('game-1', 2)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    update = workingUpdate;
    expect(
      (await service.upload('game-1', 'owner-1', file())).coverVersion,
    ).toBe(2);
  });

  it('cleans up the first unreferenced installation on an optimistic conflict', async () => {
    update = async () => {
      row = { ...row, updatedAt: new Date('2026-09-02') };
      return null;
    };
    await expect(
      service.upload('game-1', 'owner-1', file()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(storage.read('game-1', 1)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(row.coverVersion).toBe(0);
  });

  it('preserves an installation when a lost database response actually committed', async () => {
    const workingUpdate = update;
    update = async (...args) => {
      await workingUpdate(...args);
      throw new Error('lost response');
    };
    expect(
      (await service.upload('game-1', 'owner-1', file())).coverVersion,
    ).toBe(1);
    expect((await storage.read('game-1', 1)).content).toEqual(png);
  });

  it('leaves bytes intact when reconciliation cannot prove they are unreferenced', async () => {
    update = async () => {
      throw new Error('database down');
    };
    reconcile = async () => {
      throw new Error('still down');
    };
    await expect(
      service.upload('game-1', 'owner-1', file()),
    ).rejects.toMatchObject({ status: 503 });
    expect((await storage.read('game-1', 1)).content).toEqual(png);
  });

  it('does not overwrite or delete an installation owned by another writer', async () => {
    await storage.install('game-1', 1, {
      content: webp,
      contentType: 'image/webp',
    });
    await expect(
      service.upload('game-1', 'owner-1', file()),
    ).rejects.toMatchObject({ status: 409 });
    expect((await storage.read('game-1', 1)).content).toEqual(webp);
  });

  it.each([
    { visibility: 'DRAFT' },
    { visibility: 'UNLISTED' },
    { moderationState: 'FLAGGED' },
    { moderationState: 'QUARANTINED' },
    { reviewState: 'PENDING' },
    { reviewState: 'REJECTED' },
  ] as const)(
    'hides public covers for nonpublic game state %s',
    async (state) => {
      await service.upload('game-1', 'owner-1', file());
      row = { ...row, ...state };
      await expect(service.readPublic('demo', 1)).rejects.toMatchObject({
        status: 404,
      });
      expect((await service.readOwned('game-1', 'owner-1', 1)).content).toEqual(
        png,
      );
    },
  );

  it('requires owner access and exact positive current versions', async () => {
    await service.upload('game-1', 'owner-1', file());
    await expect(service.readOwned('game-1', 'other', 1)).rejects.toMatchObject(
      { status: 403 },
    );
    for (const version of [0, -1, 1.5, NaN, 2]) {
      await expect(service.readPublic('demo', version)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.readOwned('game-1', 'owner-1', version),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect((await service.readPublic('demo', 1)).content).toEqual(png);
    await expect(service.readPublic('missing', 1)).rejects.toMatchObject({
      status: 404,
    });
  });
});
