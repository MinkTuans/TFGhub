import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ArtifactFile, StoredArtifactFile } from './artifact-types.js';

const manifestName = '.indieforge-artifact.json';

type ArtifactManifest = {
  files: Array<Pick<ArtifactFile, 'path' | 'contentType'>>;
};

function defaultStorageRoot(): string {
  if (process.env.GAME_STORAGE_ROOT !== undefined) return process.env.GAME_STORAGE_ROOT;
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

@Injectable()
export class ArtifactStorage {
  private readonly root: string;

  constructor(storageRoot = defaultStorageRoot()) {
    this.root = resolve(storageRoot);
  }

  async install(gameId: string, version: number, files: ArtifactFile[]): Promise<void> {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Artifact version must be a non-negative integer');
    }

    const artifactDirectory = within(this.root, resolve(this.root, gameId, String(version)));
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
        const filePath = within(stagingDirectory, resolve(stagingDirectory, file.path));
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, { flag: 'wx' });
      }

      const manifest: ArtifactManifest = {
        files: files.map(({ path, contentType }) => ({ path, contentType })),
      };
      await writeFile(
        join(stagingDirectory, manifestName),
        JSON.stringify(manifest),
        { flag: 'wx' },
      );
      await rename(stagingDirectory, artifactDirectory);
    } catch (error) {
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async read(gameId: string, version: number, path: string): Promise<StoredArtifactFile> {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Artifact version must be a non-negative integer');
    }

    const artifactDirectory = within(this.root, resolve(this.root, gameId, String(version)));
    const filePath = within(artifactDirectory, resolve(artifactDirectory, path));
    const manifest = JSON.parse(
      await readFile(join(artifactDirectory, manifestName), 'utf8'),
    ) as ArtifactManifest;
    const metadata = manifest.files.find((file) => file.path === path);

    if (metadata === undefined) {
      throw new Error('Artifact file was not installed');
    }

    return {
      path,
      content: await readFile(filePath),
      contentType: metadata.contentType,
    };
  }
}
