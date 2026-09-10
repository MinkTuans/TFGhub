import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { assetHash, MAX_ASSET_BYTES, THUMBNAIL_RECIPE } from './asset-types.js';

const identifier = /^[a-zA-Z0-9_-]+$/;
export function assetStorageKey(
  projectId: string,
  assetId: string,
  hash: string,
) {
  if (
    !identifier.test(projectId) ||
    !identifier.test(assetId) ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    throw new Error('Invalid asset storage identity');
  return `project-assets/${projectId}/${assetId}/${hash}/source`;
}
export function thumbnailStorageKey(
  sourceKey: string,
  recipe = THUMBNAIL_RECIPE,
) {
  if (!identifier.test(recipe)) throw new Error('Invalid thumbnail recipe');
  return `${dirname(sourceKey)}/thumbnail-${recipe}.png`;
}
export class AssetStorageConflictError extends Error {}

/** Same GAME_STORAGE_ROOT filesystem abstraction as covers/artifacts. Only this
 * class handles physical paths; API contracts contain capability-relative routes. */
@Injectable()
export class AssetStorage {
  private readonly root: string;
  constructor(
    root = process.env.GAME_STORAGE_ROOT ??
      (process.env.NODE_ENV === 'production'
        ? '/var/lib/indieforge/games'
        : join(tmpdir(), 'indieforge-games')),
  ) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (
      !key ||
      key.split('/').some((part) => !part || part === '.' || part === '..') ||
      key.includes('\\') ||
      key.startsWith('/')
    )
      throw new Error('Unsafe asset path');
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`))
      throw new Error('Unsafe asset path');
    return path;
  }
  private async directories(path: string, create = false) {
    let current = parse(path).root;
    for (const part of path.slice(current.length).split(sep)) {
      current = join(current, part);
      if (create) {
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('Asset path must not contain symbolic links');
    }
  }
  async read(key: string): Promise<Buffer> {
    const path = this.path(key);
    await this.directories(dirname(path));
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_ASSET_BYTES)
        throw new Error('Invalid asset file');
      return await file.readFile();
    } finally {
      await file.close();
    }
  }
  async install(
    key: string,
    source: Buffer,
    thumbnail?: Buffer,
  ): Promise<void> {
    const path = this.path(key);
    if (
      !/^project-assets\/[\w-]+\/[\w-]+\/[a-f0-9]{64}\/source$/.test(key) ||
      key.split('/')[3] !== assetHash(source)
    )
      throw new Error('Invalid asset source identity');
    const directory = dirname(path);
    const parent = dirname(directory);
    await this.directories(parent, true);
    // Existing immutable bytes may be from a lost commit response. Reconcile by
    // exact bytes; never overwrite either source or derivative on retry.
    let existing = false;
    try {
      await lstat(directory);
      existing = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing) {
      if (
        !(await this.read(key)).equals(source) ||
        (thumbnail &&
          !(await this.read(thumbnailStorageKey(key))).equals(thumbnail))
      )
        throw new AssetStorageConflictError('Immutable asset differs');
      return;
    }
    const staging = join(parent, `.staging-${randomUUID()}`);
    await mkdir(staging, { mode: 0o700 });
    try {
      for (const [name, bytes] of [
        ['source', source],
        [`thumbnail-${THUMBNAIL_RECIPE}.png`, thumbnail],
      ] as const) {
        if (!bytes) continue;
        const file = await open(join(staging, name), 'wx', 0o400);
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
      }
      await chmod(staging, 0o500);
      await rename(staging, directory);
    } catch (error) {
      await this.removeDirectory(staging);
      if (
        ['EEXIST', 'ENOTEMPTY'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        if (
          (await this.read(key)).equals(source) &&
          (!thumbnail ||
            (await this.read(thumbnailStorageKey(key))).equals(thumbnail))
        )
          return;
        throw new AssetStorageConflictError('Immutable asset differs');
      }
      throw error;
    }
  }
  private async removeDirectory(directory: string) {
    await this.directories(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    if (
      entries.some(
        (entry) =>
          !entry.isFile() ||
          (entry.name !== 'source' &&
            !/^thumbnail-[\w-]+\.png$/.test(entry.name)),
      )
    )
      throw new Error('Unexpected asset storage entry');
    await chmod(directory, 0o700);
    for (const entry of entries) await unlink(join(directory, entry.name));
    await rmdir(directory);
  }
  /** Only called after a durable DB GC_PENDING claim under the asset lock. */
  async discardClaimed(key: string): Promise<void> {
    if (!/^project-assets\/[\w-]+\/[\w-]+\/[a-f0-9]{64}\/source$/.test(key))
      throw new Error('Only managed asset storage may be collected');
    try {
      await this.removeDirectory(dirname(this.path(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
