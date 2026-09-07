import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactStorage } from './artifact-storage.js';

describe('ArtifactStorage', () => {
  let storageRoot: string;
  let storage: ArtifactStorage;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'indieforge-artifacts-'));
    storage = new ArtifactStorage(storageRoot);
  });

  afterEach(async () => {
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

  it('rejects read paths that escape the selected artifact version', async () => {
    await storage.install('game-1', 1, [
      { path: 'index.html', content: 'safe', contentType: 'text/html' },
    ]);
    await writeFile(join(storageRoot, 'game-1', 'secret.txt'), 'private');

    await expect(storage.read('game-1', 1, '../secret.txt')).rejects.toThrow(
      'Artifact path must stay within its artifact directory',
    );
  });
});
