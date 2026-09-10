import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  chmod,
  unlink,
  writeFile,
} from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssetStorage,
  assetStorageKey,
  thumbnailStorageKey,
} from './asset-storage.js';
import { assetHash } from './asset-types.js';
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
}));

describe('immutable asset storage', () => {
  let root: string;
  let storage: AssetStorage;
  const original = Buffer.from('original immutable bytes');
  const thumb = Buffer.from('derived bytes');
  const key = assetStorageKey('project', 'asset', assetHash(original));
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'asset-storage-test-'));
    storage = new AssetStorage(root);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    async function unseal(path: string) {
      await chmod(path, 0o700);
      for (const item of await readdir(path, { withFileTypes: true }))
        if (item.isDirectory()) await unseal(join(path, item.name));
    }
    await unseal(root);
    await rm(root, { recursive: true, force: true });
  });
  it('atomically installs source and thumbnail, converges concurrent exact retries, and refuses replacing a derivative', async () => {
    await Promise.all([
      storage.install(key, original, thumb),
      storage.install(key, original, thumb),
    ]);
    expect(await storage.read(key)).toEqual(original);
    expect(await storage.read(thumbnailStorageKey(key))).toEqual(thumb);
    await expect(
      storage.install(key, original, Buffer.from('changed')),
    ).rejects.toThrow();
    expect(await storage.read(key)).toEqual(original);
    expect(await readdir(join(root, 'project-assets/project/asset'))).toEqual([
      assetHash(original),
    ]);
  });
  it('cleans both staged files if atomic rename fails and never publishes partial data', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      new Error('Injected rename failure'),
    );
    await expect(storage.install(key, original, thumb)).rejects.toThrow(
      'Injected rename failure',
    );
    expect(await readdir(join(root, 'project-assets/project/asset'))).toEqual(
      [],
    );
    await expect(storage.read(key)).rejects.toThrow();
  });
  it('rejects traversal and symbolic links at root, ancestors, project, source and thumbnail', async () => {
    for (const path of [
      '../secret',
      '/etc/passwd',
      'project-assets/../secret',
      'project-assets\\escape',
    ])
      await expect(storage.read(path)).rejects.toThrow();
    const outside = join(root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'secret'), 'untouched');
    await symlink(outside, join(root, 'alias'));
    await expect(
      new AssetStorage(join(root, 'alias', 'nested')).install(key, original),
    ).rejects.toThrow();
    expect(await readdir(outside)).toEqual(['secret']);
    await mkdir(join(root, 'project-assets'));
    await symlink(outside, join(root, 'project-assets/project'));
    await expect(storage.install(key, original)).rejects.toThrow();
    await unlink(join(root, 'project-assets/project'));
    await storage.install(key, original, thumb);
    const directory = join(root, dirname(key));
    await chmod(directory, 0o700);
    for (const target of [key, thumbnailStorageKey(key)]) {
      await unlink(join(root, target));
      await symlink(join(outside, 'secret'), join(root, target));
      await expect(storage.read(target)).rejects.toThrow();
    }
    await expect(storage.discardClaimed(key)).rejects.toThrow();
    expect(await readFile(join(outside, 'secret'), 'utf8')).toBe('untouched');
  });
  it('refuses to replace an existing incomplete immutable directory', async () => {
    await storage.install(key, original, thumb);
    await chmod(join(root, dirname(key)), 0o700);
    await unlink(join(root, thumbnailStorageKey(key)));
    await expect(storage.install(key, original, thumb)).rejects.toThrow();
    expect(await storage.read(key)).toEqual(original);
  });
  it('does not overwrite an existing empty content-addressed directory', async () => {
    await mkdir(join(root, dirname(key)), { recursive: true });
    await expect(storage.install(key, original, thumb)).rejects.toThrow();
    expect(await readdir(join(root, dirname(key)))).toEqual([]);
  });
});
