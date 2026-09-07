import {
  chmod,
  mkdtemp,
  readFile,
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
import { ArtifactStorage } from './artifact-storage.js';

async function makeRemovable(directory: string): Promise<void> {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) await makeRemovable(entryPath);
    else if (!entry.isSymbolicLink()) await chmod(entryPath, 0o644);
  }
}

describe('ArtifactStorage', () => {
  let storageRoot: string;
  let storage: ArtifactStorage;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'indieforge-artifacts-'));
    storage = new ArtifactStorage(storageRoot);
  });

  afterEach(async () => {
    await makeRemovable(storageRoot);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it.each(['../outside.html', '/tmp/outside.html', 'nested/../../outside.html'])(
    'rejects an install path that escapes its artifact directory: %s',
    async (unsafePath) => {
      await expect(
        storage.install('game-1', 1, [
          { path: unsafePath, content: 'outside', contentType: 'text/html' },
        ]),
      ).rejects.toThrow('Artifact path must stay within its artifact directory');

      await expect(readFile(join(storageRoot, 'outside.html'))).rejects.toThrow();
    },
  );

  it('publishes a complete staged version and retains each file content type', async () => {
    await storage.install('game-1', 2, [
      { path: 'index.html', content: '<h1>Play</h1>', contentType: 'text/html' },
      { path: 'assets/theme.css', content: 'body{}', contentType: 'text/css' },
    ]);

    await expect(readFile(join(storageRoot, 'game-1', '2', 'index.html'), 'utf8')).resolves.toBe('<h1>Play</h1>');
    await expect(storage.read('game-1', 2, 'assets/theme.css')).resolves.toEqual({
      path: 'assets/theme.css',
      content: expect.any(Buffer),
      contentType: 'text/css',
    });
    expect((await storage.read('game-1', 2, 'assets/theme.css')).content.toString()).toBe('body{}');

    expect(await readdir(join(storageRoot, 'game-1'))).toEqual(['2']);
  });

  it('does not leave a partially published version after a staged write fails', async () => {
    await expect(
      storage.install('game-1', 3, [
        { path: 'index.html', content: 'one', contentType: 'text/html' },
        { path: 'index.html', content: 'two', contentType: 'text/html' },
      ]),
    ).rejects.toThrow();

    await expect(readdir(join(storageRoot, 'game-1'))).resolves.toEqual([]);
  });

  it('removes sealed staging when publication cannot replace an existing version', async () => {
    await storage.install('game-1', 1, [
      { path: 'index.html', content: 'first', contentType: 'text/html' },
    ]);

    await expect(
      storage.install('game-1', 1, [
        { path: 'index.html', content: 'second', contentType: 'text/html' },
      ]),
    ).rejects.toThrow();

    await expect(readdir(join(storageRoot, 'game-1'))).resolves.toEqual(['1']);
  });

  it('rejects read paths that escape the selected artifact version', async () => {
    await storage.install('game-1', 1, [
      { path: 'index.html', content: 'safe', contentType: 'text/html' },
    ]);
    await writeFile(join(storageRoot, 'game-1', 'secret.txt'), 'private');

    await expect(storage.read('game-1', 1, '../secret.txt')).rejects.toThrow(
      'Artifact path must stay within its artifact directory',
    );
  });

  it('rejects an installed artifact file replaced with an external symlink', async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), 'indieforge-outside-'));
    const externalFile = join(outsideRoot, 'secret.txt');
    const artifactFile = join(storageRoot, 'game-1', '1', 'index.html');

    try {
      await storage.install('game-1', 1, [
        { path: 'index.html', content: 'safe', contentType: 'text/html' },
      ]);
      await writeFile(externalFile, 'private');
      // Simulate a privileged volume mutator; normal API permissions prohibit
      // this replacement, while read still retains symlink defense in depth.
      await makeRemovable(join(storageRoot, 'game-1', '1'));
      await rm(artifactFile);
      await symlink(externalFile, artifactFile);

      await expect(storage.read('game-1', 1, 'index.html')).rejects.toThrow(
        'Artifact path must not contain symbolic links',
      );
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('publishes immutable files and directories while allowing a later version sibling', async () => {
    await storage.install('game-1', 1, [
      { path: 'index.html', content: 'safe', contentType: 'text/html' },
      { path: 'assets/runtime.js', content: 'run()', contentType: 'text/javascript' },
    ]);

    const versionDirectory = join(storageRoot, 'game-1', '1');
    const nestedDirectory = join(versionDirectory, 'assets');
    const leaf = join(versionDirectory, 'index.html');
    expect((await stat(leaf)).mode & 0o222).toBe(0);
    expect((await stat(nestedDirectory)).mode & 0o222).toBe(0);
    expect((await stat(versionDirectory)).mode & 0o222).toBe(0);

    if (process.getuid?.() !== 0) {
      await expect(writeFile(leaf, 'changed')).rejects.toThrow();
      await expect(unlink(leaf)).rejects.toThrow();
      await expect(writeFile(join(nestedDirectory, 'replacement.js'), 'changed')).rejects.toThrow();
    }

    await storage.install('game-1', 2, [
      { path: 'index.html', content: 'new version', contentType: 'text/html' },
    ]);
    await expect(storage.read('game-1', 2, 'index.html')).resolves.toMatchObject({
      contentType: 'text/html',
    });
  });
});
