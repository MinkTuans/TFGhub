import {
  chmod,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoverStorage, CoverVersionExistsError } from './cover-storage.js';
import type { StoredCover } from './cover-types.js';

async function makeRemovable(directory: string): Promise<void> {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) await makeRemovable(entryPath);
    else if (!entry.isSymbolicLink()) await chmod(entryPath, 0o644);
  }
}

describe('CoverStorage', () => {
  let storageRoot: string;
  let storage: CoverStorage;
  const cover: StoredCover = {
    content: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    contentType: 'image/jpeg',
  };

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'indieforge-covers-'));
    storage = new CoverStorage(storageRoot);
  });

  afterEach(async () => {
    await makeRemovable(storageRoot);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('atomically publishes and reads a versioned cover in the isolated cover namespace', async () => {
    await storage.install('game-1', 1, cover);

    await expect(storage.read('game-1', 1)).resolves.toEqual(cover);
    await expect(
      readdir(join(storageRoot, 'covers', 'game-1')),
    ).resolves.toEqual(['1']);
  });

  it('keeps an existing version readable and removes its staging directory when replacement fails', async () => {
    await storage.install('game-1', 1, cover);

    await expect(
      storage.install('game-1', 1, {
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(CoverVersionExistsError);

    await expect(storage.read('game-1', 1)).resolves.toEqual(cover);
    expect(await readdir(join(storageRoot, 'covers', 'game-1'))).toEqual(['1']);
  });

  it('removes staging and preserves a published version when a staged cover write fails', async () => {
    await storage.install('game-1', 1, cover);
    const invalidCover = {
      content: undefined,
      contentType: 'image/png',
    } as unknown as StoredCover;

    await expect(storage.install('game-1', 2, invalidCover)).rejects.toThrow(
      TypeError,
    );

    await expect(storage.read('game-1', 1)).resolves.toEqual(cover);
    expect(await readdir(join(storageRoot, 'covers', 'game-1'))).toEqual(['1']);
  });

  it.each(['../escape', '/tmp/escape', 'nested/../../escape'])(
    'rejects a game id that escapes the cover root: %s',
    async (gameId) => {
      await expect(storage.install(gameId, 1, cover)).rejects.toThrow(/within/);
      await expect(storage.read(gameId, 1)).rejects.toThrow(/within/);
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects a non-positive safe-integer version: %s',
    async (version) => {
      await expect(storage.install('game-1', version, cover)).rejects.toThrow(
        /positive safe integer/,
      );
    },
  );

  it('rejects a published cover replaced with an external symlink', async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), 'indieforge-outside-'));
    const externalFile = join(outsideRoot, 'secret.jpg');
    const coverFile = join(storageRoot, 'covers', 'game-1', '1', 'cover');

    try {
      await storage.install('game-1', 1, cover);
      await writeFile(externalFile, 'private');
      await makeRemovable(join(storageRoot, 'covers', 'game-1', '1'));
      await rm(coverFile);
      await symlink(externalFile, coverFile);

      await expect(storage.read('game-1', 1)).rejects.toThrow(
        'Cover path must not contain symbolic links',
      );
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('publishes immutable covers while allowing a later version sibling', async () => {
    await storage.install('game-1', 1, cover);

    const versionDirectory = join(storageRoot, 'covers', 'game-1', '1');
    const coverFile = join(versionDirectory, 'cover');
    expect((await stat(versionDirectory)).mode & 0o222).toBe(0);
    expect((await stat(coverFile)).mode & 0o222).toBe(0);

    if (process.getuid?.() !== 0) {
      await expect(unlink(coverFile)).rejects.toThrow();
    }

    await storage.install('game-1', 2, {
      content: Buffer.from([0x52, 0x49, 0x46, 0x46]),
      contentType: 'image/webp',
    });
    await expect(storage.read('game-1', 2)).resolves.toMatchObject({
      contentType: 'image/webp',
    });
  });

  it('discards the first unreferenced version when the database references no cover', async () => {
    await storage.install('game-1', 1, cover);

    await storage.discardUnreferenced('game-1', 1, 0);

    await expect(storage.read('game-1', 1)).rejects.toThrow();
    expect(await readdir(join(storageRoot, 'covers', 'game-1'))).toEqual([]);
  });

  it('discards only the explicitly unreferenced next version', async () => {
    await storage.install('game-1', 1, cover);
    await storage.install('game-1', 2, {
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/png',
    });

    await expect(storage.discardUnreferenced('game-1', 1, 1)).rejects.toThrow(
      /unreferenced next cover version/,
    );
    await expect(
      storage.discardUnreferenced('../game-1', 2, 1),
    ).rejects.toThrow(/unreferenced next cover version/);

    await storage.discardUnreferenced('game-1', 2, 1);
    expect(await readdir(join(storageRoot, 'covers', 'game-1'))).toEqual(['1']);
    await expect(storage.read('game-1', 1)).resolves.toEqual(cover);
  });
});
