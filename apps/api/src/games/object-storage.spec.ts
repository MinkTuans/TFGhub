import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LocalObjectStorage,
  R2ObjectStorage,
  createObjectStorage,
  type ObjectBucket,
} from './object-storage.js';

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

describe('R2ObjectStorage', () => {
  it('stores zips in the bucket and rejects escaping keys', async () => {
    const objects = new Map<string, Buffer>();
    const bucket: ObjectBucket = {
      async put(key, body) {
        objects.set(key, Buffer.from(body));
      },
      async get(key) {
        const value = objects.get(key);
        return value ? Buffer.from(value) : null;
      },
    };
    const storage = new R2ObjectStorage(bucket);
    await storage.put('quarantine/game-1/orbit.zip', Buffer.from('PK'));
    await expect(storage.get('quarantine/game-1/orbit.zip')).resolves.toEqual(
      Buffer.from('PK'),
    );
    await expect(storage.get('missing.zip')).resolves.toBeNull();
    await expect(
      storage.put('../escape.zip', Buffer.from('nope')),
    ).rejects.toThrow(/storage key/);
    expect([...objects.keys()]).toEqual(['quarantine/game-1/orbit.zip']);
  });
});

describe('createObjectStorage', () => {
  it('uses local disk when STORAGE_DIR is set and R2 is not configured', () => {
    const previous = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = '/tmp/indieforge-objects';
    delete process.env.CLOUDFLARE_R2_BUCKET;
    try {
      expect(createObjectStorage().constructor.name).toBe('LocalObjectStorage');
    } finally {
      if (previous === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previous;
    }
  });
});
