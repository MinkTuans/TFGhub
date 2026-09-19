import { randomUUID } from 'node:crypto';
import {
  chmod,
  copyFile,
  constants,
  mkdir,
  lstat,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  ArtifactInstallFile,
  ArtifactFile,
  StoredArtifactFile,
} from './artifact-types.js';

const manifestName = '.indieforge-artifact.json';

type ArtifactManifest = {
  files: Array<Pick<ArtifactFile, 'path' | 'contentType'>>;
};

function isStagedFile(file: ArtifactInstallFile): file is Extract<
  ArtifactInstallFile,
  { sourcePath: string }
> {
  return 'sourcePath' in file;
}

export class ArtifactVersionExistsError extends Error {}

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
    throw new Error('Artifact path must stay within its artifact directory');
  }

  return resolvedCandidate;
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
      throw new Error('Artifact path must not contain symbolic links');
    }
  }
}

/**
 * Makes a staged version immutable to the API user before its atomic publish.
 * The version's parent remains writable solely to create later version siblings.
 */
async function sealPublishedTree(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await sealPublishedTree(entryPath);
    } else if (entry.isFile()) {
      await chmod(entryPath, 0o444);
    } else {
      throw new Error(
        'Artifact staging directory contains an unsupported entry',
      );
    }
  }

  await chmod(directory, 0o555);
}

async function unsealStagingTree(directory: string): Promise<void> {
  try {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) await unsealStagingTree(entryPath);
      else if (!entry.isSymbolicLink()) await chmod(entryPath, 0o644);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

@Injectable()
export class ArtifactStorage {
  private readonly root: string;

  constructor(storageRoot = defaultStorageRoot()) {
    this.root = resolve(storageRoot);
  }

  async install(
    gameId: string,
    version: number,
    files: ArtifactInstallFile[],
  ): Promise<void> {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Artifact version must be a non-negative integer');
    }

    const artifactDirectory = within(
      this.root,
      resolve(this.root, gameId, String(version)),
    );
    const artifactParent = dirname(artifactDirectory);
    const stagingDirectory = within(
      artifactParent,
      join(artifactParent, `.staging-${randomUUID()}`),
    );

    for (const file of files) {
      if (file.path === manifestName) {
        throw new Error('Artifact path is reserved');
      }
      within(artifactDirectory, resolve(artifactDirectory, file.path));
    }

    await mkdir(artifactParent, { recursive: true });

    try {
      await mkdir(stagingDirectory);
      for (const file of files) {
        const filePath = within(
          stagingDirectory,
          resolve(stagingDirectory, file.path),
        );
        await mkdir(dirname(filePath), { recursive: true });
        if (isStagedFile(file)) {
          await copyFile(file.sourcePath, filePath, constants.COPYFILE_EXCL);
        } else {
          await writeFile(filePath, file.content, { flag: 'wx' });
        }
      }

      const manifest: ArtifactManifest = {
        files: files.map(({ path, contentType }) => ({ path, contentType })),
      };
      await writeFile(
        join(stagingDirectory, manifestName),
        JSON.stringify(manifest),
        { flag: 'wx' },
      );
      await sealPublishedTree(stagingDirectory);
      try {
        await rename(stagingDirectory, artifactDirectory);
      } catch (error) {
        if (
          ['EEXIST', 'ENOTEMPTY'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        ) {
          throw new ArtifactVersionExistsError(
            'Artifact version already exists',
          );
        }
        throw error;
      }
    } catch (error) {
      await unsealStagingTree(stagingDirectory);
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
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
      referencedVersion < 0 ||
      !Number.isSafeInteger(version) ||
      version !== referencedVersion + 1
    ) {
      throw new Error(
        'Only the unreferenced next artifact version may be discarded',
      );
    }
    const directory = within(
      this.root,
      resolve(this.root, gameId, String(version)),
    );
    try {
      await rejectSymbolicLinks(this.root, directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await unsealStagingTree(directory);
    await rm(directory, { recursive: true });
  }

  async read(
    gameId: string,
    version: number,
    path: string,
  ): Promise<StoredArtifactFile> {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Artifact version must be a non-negative integer');
    }

    const artifactDirectory = within(
      this.root,
      resolve(this.root, gameId, String(version)),
    );
    const filePath = within(
      artifactDirectory,
      resolve(artifactDirectory, path),
    );
    const manifestPath = join(artifactDirectory, manifestName);

    await rejectSymbolicLinks(this.root, artifactDirectory);
    await rejectSymbolicLinks(artifactDirectory, manifestPath);
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as ArtifactManifest;
    const metadata = manifest.files.find((file) => file.path === path);

    if (metadata === undefined) {
      throw new Error('Artifact file was not installed');
    }

    await rejectSymbolicLinks(artifactDirectory, filePath);

    return {
      path,
      content: await readFile(filePath),
      contentType: metadata.contentType,
    };
  }
}
