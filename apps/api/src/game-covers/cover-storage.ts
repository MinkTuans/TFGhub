import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { CoverContentType, StoredCover } from './cover-types.js';

const metadataName = '.indieforge-cover.json';

type CoverMetadata = {
  contentType: CoverContentType;
};

export class CoverVersionExistsError extends Error {}

function defaultStorageRoot(): string {
  if (process.env.GAME_STORAGE_ROOT !== undefined)
    return process.env.GAME_STORAGE_ROOT;
  if (process.env.NODE_ENV === 'production') return '/var/lib/indieforge/games';
  return join(tmpdir(), 'indieforge-games');
}

function within(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);

  if (!resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error('Cover path must stay within its cover directory');
  }

  return resolvedCandidate;
}

function validateGameId(gameId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(gameId)) {
    throw new Error('Cover path must stay within its cover directory');
  }
}

function validateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error('Cover version must be a positive safe integer');
  }
}

function isCoverContentType(value: unknown): value is CoverContentType {
  return (
    value === 'image/jpeg' || value === 'image/png' || value === 'image/webp'
  );
}

async function rejectSymbolicLinks(
  root: string,
  candidate: string,
): Promise<void> {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = within(resolvedRoot, candidate);
  const components = relative(resolvedRoot, resolvedCandidate).split(sep);
  let current = resolvedRoot;

  for (const component of components) {
    current = join(current, component);
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error('Cover path must not contain symbolic links');
    }
  }
}

async function rejectRootSymbolicLink(root: string): Promise<void> {
  if ((await lstat(root)).isSymbolicLink()) {
    throw new Error('Cover path must not contain symbolic links');
  }
}

async function sealStagingDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      throw new Error('Cover staging directory contains an unsupported entry');
    }
    await chmod(join(directory, entry.name), 0o444);
  }
  await chmod(directory, 0o555);
}

async function unsealDirectory(directory: string): Promise<void> {
  try {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isSymbolicLink())
        await chmod(join(directory, entry.name), 0o644);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

@Injectable()
export class CoverStorage {
  private readonly root: string;
  private readonly coverRoot: string;

  constructor(storageRoot = defaultStorageRoot()) {
    this.root = resolve(storageRoot);
    this.coverRoot = join(this.root, 'covers');
  }

  async install(
    gameId: string,
    version: number,
    cover: StoredCover,
  ): Promise<void> {
    validateGameId(gameId);
    validateVersion(version);

    const gameDirectory = within(
      this.coverRoot,
      resolve(this.coverRoot, gameId),
    );
    const versionDirectory = within(
      gameDirectory,
      resolve(gameDirectory, String(version)),
    );

    await mkdir(this.coverRoot, { recursive: true });
    await rejectRootSymbolicLink(this.coverRoot);
    await mkdir(gameDirectory, { recursive: true });
    await rejectSymbolicLinks(this.coverRoot, gameDirectory);

    const stagingDirectory = within(
      gameDirectory,
      join(gameDirectory, `.staging-${randomUUID()}`),
    );

    try {
      await mkdir(stagingDirectory);
      await writeFile(join(stagingDirectory, 'cover'), cover.content, {
        flag: 'wx',
      });
      await writeFile(
        join(stagingDirectory, metadataName),
        JSON.stringify({
          contentType: cover.contentType,
        } satisfies CoverMetadata),
        { flag: 'wx' },
      );
      await sealStagingDirectory(stagingDirectory);
      try {
        await rename(stagingDirectory, versionDirectory);
      } catch (error) {
        if (
          ['EEXIST', 'ENOTEMPTY'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        ) {
          throw new CoverVersionExistsError('Cover version already exists');
        }
        throw error;
      }
    } catch (error) {
      await unsealDirectory(stagingDirectory);
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async read(gameId: string, version: number): Promise<StoredCover> {
    validateGameId(gameId);
    validateVersion(version);

    const gameDirectory = within(
      this.coverRoot,
      resolve(this.coverRoot, gameId),
    );
    const versionDirectory = within(
      gameDirectory,
      resolve(gameDirectory, String(version)),
    );
    const coverPath = within(versionDirectory, join(versionDirectory, 'cover'));
    const metadataPath = within(
      versionDirectory,
      join(versionDirectory, metadataName),
    );

    await rejectRootSymbolicLink(this.coverRoot);
    await rejectSymbolicLinks(this.coverRoot, gameDirectory);
    await rejectSymbolicLinks(gameDirectory, versionDirectory);
    await rejectSymbolicLinks(versionDirectory, coverPath);
    await rejectSymbolicLinks(versionDirectory, metadataPath);

    const metadata = JSON.parse(
      await readFile(metadataPath, 'utf8'),
    ) as CoverMetadata;
    if (!isCoverContentType(metadata.contentType)) {
      throw new Error('Cover metadata contains an unsupported content type');
    }

    return {
      content: await readFile(coverPath),
      contentType: metadata.contentType,
    };
  }

  /** Caller must hold its per-game mutation lock and supply a fresh DB version. */
  async discardUnreferenced(
    gameId: string,
    version: number,
    referencedVersion: number,
  ): Promise<void> {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(gameId) ||
      !Number.isSafeInteger(referencedVersion) ||
      referencedVersion <= 0 ||
      !Number.isSafeInteger(version) ||
      version !== referencedVersion + 1
    ) {
      throw new Error(
        'Only the unreferenced next cover version may be discarded',
      );
    }

    const gameDirectory = within(
      this.coverRoot,
      resolve(this.coverRoot, gameId),
    );
    const versionDirectory = within(
      gameDirectory,
      resolve(gameDirectory, String(version)),
    );

    try {
      await rejectRootSymbolicLink(this.coverRoot);
      await rejectSymbolicLinks(this.coverRoot, gameDirectory);
      await rejectSymbolicLinks(gameDirectory, versionDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }

    await unsealDirectory(versionDirectory);
    await rm(versionDirectory, { recursive: true });
  }
}
