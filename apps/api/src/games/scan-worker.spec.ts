import { ConflictException } from '@nestjs/common';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from './object-storage.js';
import { ScanWorker } from './scan-worker.js';
import type {
  OwnedGame,
  StoredVersion,
  VersionsRepository,
} from './versions.repository.js';

async function html5Zip(extra?: Record<string, string | Uint8Array>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', '<html><body>ok</body></html>');
  for (const [name, body] of Object.entries(extra ?? {})) zip.file(name, body);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

function scanningVersion(overrides: Partial<StoredVersion> = {}): StoredVersion {
  return {
    id: 'ver-1',
    gameId: 'game-1',
    status: 'SCANNING',
    filename: 'orbit.zip',
    byteSize: 12,
    checksumSha256: 'a'.repeat(64),
    storageKey: 'quarantine/game-1/ver-1/orbit.zip',
    findings: '',
    uploadToken: null,
    uploadExpiresAt: null,
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
    ...overrides,
  };
}

function repoWith(version: StoredVersion): VersionsRepository {
  const game: OwnedGame = {
    id: 'game-1',
    ownerId: 'owner-1',
    visibility: 'DRAFT',
    moderationState: 'CLEAR',
    activeVersionId: null,
  };
  const versions = new Map<string, StoredVersion>([[version.id, version]]);
  return {
    async create() {
      throw new Error('unused');
    },
    async findById(id) {
      return versions.get(id) ?? null;
    },
    async findByUploadToken() {
      return null;
    },
    async save(row) {
      versions.set(row.id, { ...row });
      return versions.get(row.id)!;
    },
    async findGame(id) {
      return id === game.id ? game : null;
    },
    async findPublishedRuntime() {
      return null;
    },
    async listByGame() {
      return [...versions.values()];
    },
    async publish() {
      throw new Error('unused');
    },
  };
}

describe('ScanWorker', () => {
  it('marks a valid HTML5 zip READY without publishing it', async () => {
    const archive = await html5Zip();
    const storage = new MemoryObjectStorage();
    const version = scanningVersion({ byteSize: archive.length });
    await storage.put(version.storageKey, archive);
    const worker = new ScanWorker(repoWith(version), storage);
    const scanned = await worker.process(version.id);
    expect(scanned.status).toBe('READY');
    expect(scanned.findings).toBe('');
  });

  it('rejects a disguised MZ payload and leaves the game unpublished', async () => {
    const archive = await html5Zip({
      'sprite.bin': new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    });
    const storage = new MemoryObjectStorage();
    const version = scanningVersion({ byteSize: archive.length });
    await storage.put(version.storageKey, archive);
    const worker = new ScanWorker(repoWith(version), storage);
    const scanned = await worker.process(version.id);
    expect(scanned.status).toBe('REJECTED');
    expect(scanned.findings).toMatch(/Malware indicator \(MZ\)/);
  });

  it('does not scan a version that is not queued', async () => {
    const worker = new ScanWorker(
      repoWith(scanningVersion({ status: 'UPLOADING' })),
      new MemoryObjectStorage(),
    );
    await expect(worker.process('ver-1')).rejects.toThrow(ConflictException);
  });
});
