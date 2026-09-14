import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from './object-storage.js';
import { ScanWorker } from './scan-worker.js';
import type {
  OwnedGame,
  StoredVersion,
  VersionsRepository,
} from './versions.repository.js';
import { VersionsService } from './versions.service.js';

async function html5Zip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', '<html><body>ok</body></html>');
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

function makeRepo(game: OwnedGame, versions: Map<string, StoredVersion>): VersionsRepository {
  return {
    async create(input) {
      const stored: StoredVersion = {
        id: `ver-${versions.size + 1}`,
        status: 'UPLOADING',
        findings: '',
        createdAt: new Date('2026-09-05T12:00:00.000Z'),
        ...input,
      };
      versions.set(stored.id, stored);
      return stored;
    },
    async findById(id) {
      return versions.get(id) ?? null;
    },
    async findByUploadToken(token) {
      return (
        [...versions.values()].find((version) => version.uploadToken === token) ??
        null
      );
    },
    async save(version) {
      versions.set(version.id, { ...version });
      return versions.get(version.id)!;
    },
    async findGame(id) {
      return id === game.id ? game : null;
    },
    async findPublishedRuntime() {
      return null;
    },
    async listByGame(gameId) {
      return [...versions.values()].filter((row) => row.gameId === gameId);
    },
    async publish(gameId, versionId) {
      game.activeVersionId = versionId;
      game.visibility = 'PUBLIC';
      return {
        id: gameId,
        slug: 'orbit-orchard',
        title: 'Orbit Orchard',
        description: '',
        visibility: 'PUBLIC',
        accessMode: 'GUEST_ALLOWED',
        moderationState: 'CLEAR',
        createdAt: '2026-09-05T12:00:00.000Z',
        updatedAt: '2026-09-05T12:10:00.000Z',
      };
    },
  };
}

function serviceFor(
  game: OwnedGame,
  versions: Map<string, StoredVersion>,
  storage = new MemoryObjectStorage(),
) {
  const repo = makeRepo(game, versions);
  return new VersionsService(repo, storage, new ScanWorker(repo, storage));
}

describe('VersionsService', () => {
  const game: OwnedGame = {
    id: 'game-1',
    ownerId: 'owner-1',
    visibility: 'DRAFT',
    moderationState: 'CLEAR',
    activeVersionId: null,
  };

  it('does not create an upload slot for another developer', async () => {
    const service = serviceFor(game, new Map());
    await expect(
      service.createUpload(
        'game-1',
        'owner-2',
        {
          filename: 'orbit.zip',
          byteSize: 12,
          checksumSha256: 'a'.repeat(64),
        },
        'http://localhost:3001',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects completion when the checksum does not match', async () => {
    const archive = await html5Zip();
    const versions = new Map<string, StoredVersion>();
    const storage = new MemoryObjectStorage();
    const service = serviceFor(game, versions, storage);
    const created = await service.createUpload(
      'game-1',
      'owner-1',
      {
        filename: 'orbit.zip',
        byteSize: archive.length,
        checksumSha256: createHash('sha256').update(archive).digest('hex'),
      },
      'http://localhost:3001',
    );
    const token = created.uploadUrl.split('/').at(-1)!;
    await service.receiveUpload(token, archive);
    await expect(
      service.complete('game-1', created.id, 'owner-1', 'b'.repeat(64)),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks a valid HTML5 zip READY and publishes it without replacing a failed later upload', async () => {
    const archive = await html5Zip();
    const checksum = createHash('sha256').update(archive).digest('hex');
    const versions = new Map<string, StoredVersion>();
    const storage = new MemoryObjectStorage();
    const service = serviceFor(game, versions, storage);
    const created = await service.createUpload(
      'game-1',
      'owner-1',
      { filename: 'orbit.zip', byteSize: archive.length, checksumSha256: checksum },
      'http://localhost:3001',
    );
    await service.receiveUpload(created.uploadUrl.split('/').at(-1)!, archive);
    const completed = await service.complete('game-1', created.id, 'owner-1', checksum);
    expect(completed.status).toBe('READY');
    expect(completed.findings).toBe('');
    const published = await service.publish('game-1', 'owner-1', created.id);
    expect(published.visibility).toBe('PUBLIC');
  });

  it('does not publish a rejected build', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'no index');
    const archive = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const checksum = createHash('sha256').update(archive).digest('hex');
    const versions = new Map<string, StoredVersion>();
    const service = serviceFor(game, versions);
    const created = await service.createUpload(
      'game-1',
      'owner-1',
      { filename: 'orbit.zip', byteSize: archive.length, checksumSha256: checksum },
      'http://localhost:3001',
    );
    await service.receiveUpload(created.uploadUrl.split('/').at(-1)!, archive);
    const completed = await service.complete('game-1', created.id, 'owner-1', checksum);
    expect(completed.status).toBe('REJECTED');
    await expect(service.publish('game-1', 'owner-1', created.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rolls back to a previous READY version without deleting later builds', async () => {
    const archive = await html5Zip();
    const checksum = createHash('sha256').update(archive).digest('hex');
    const versions = new Map<string, StoredVersion>();
    const storage = new MemoryObjectStorage();
    const current = { ...game };
    const service = serviceFor(current, versions, storage);
    async function ship(name: string) {
      const created = await service.createUpload(
        'game-1',
        'owner-1',
        { filename: name, byteSize: archive.length, checksumSha256: checksum },
        'http://localhost:3001',
      );
      await service.receiveUpload(created.uploadUrl.split('/').at(-1)!, archive);
      await service.complete('game-1', created.id, 'owner-1', checksum);
      await service.publish('game-1', 'owner-1', created.id);
      return created.id;
    }
    const first = await ship('one.zip');
    const second = await ship('two.zip');
    expect(current.activeVersionId).toBe(second);
    const rolled = await service.rollback('game-1', 'owner-1', first);
    expect(rolled.visibility).toBe('PUBLIC');
    expect(current.activeVersionId).toBe(first);
    expect(versions.get(second)?.status).toBe('READY');
    await expect(service.rollback('game-1', 'owner-1', first)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns a presigned PUT URL when object storage can sign', async () => {
    const storage = new MemoryObjectStorage();
    storage.presignPut = async (key, seconds) =>
      `https://r2.example/${key}?exp=${seconds}`;
    const service = serviceFor(game, new Map(), storage);
    const created = await service.createUpload(
      'game-1',
      'owner-1',
      {
        filename: 'orbit.zip',
        byteSize: 12,
        checksumSha256: 'a'.repeat(64),
      },
      'http://localhost:3001',
    );
    expect(created.uploadUrl).toMatch(
      /^https:\/\/r2\.example\/quarantine\/game-1\/[a-f0-9]+\/orbit\.zip\?exp=900$/,
    );
  });

  it('lists owned versions and forbids other developers', async () => {
    const versions = new Map<string, StoredVersion>();
    const service = serviceFor(game, versions);
    await service.createUpload(
      'game-1',
      'owner-1',
      {
        filename: 'orbit.zip',
        byteSize: 12,
        checksumSha256: 'a'.repeat(64),
      },
      'http://localhost:3001',
    );
    const listed = await service.listOwned('game-1', 'owner-1');
    expect(listed).toHaveLength(1);
    await expect(service.listOwned('game-1', 'owner-2')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('ingests a zip for the owner, scans it, and returns READY', async () => {
    const archive = await html5Zip();
    const versions = new Map<string, StoredVersion>();
    const service = serviceFor(game, versions);
    const result = await service.ingestOwnedZip(
      'game-1',
      'owner-1',
      'engine.zip',
      archive,
    );
    expect(result.status).toBe('READY');
    expect(result.filename).toBe('engine.zip');
    expect(result.findings).toBe('');
  });
});
