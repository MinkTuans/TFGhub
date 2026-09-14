import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalObjectStorage } from './object-storage.js';

describe('LocalObjectStorage', () => {
  it('round-trips a zip and rejects keys that escape the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'indieforge-storage-'));
    try {
      const storage = new LocalObjectStorage(root);
      await storage.put('quarantine/game-1/orbit.zip', Buffer.from('PK'));
      await expect(storage.get('quarantine/game-1/orbit.zip')).resolves.toEqual(
        Buffer.from('PK'),
      );
      await expect(storage.get('missing.zip')).resolves.toBeNull();
      await expect(
        storage.put('../escape.zip', Buffer.from('nope')),
      ).rejects.toThrow(/storage key/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
