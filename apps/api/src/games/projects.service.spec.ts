import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from './object-storage.js';
import { ProjectsService, type ProjectsRepository } from './projects.service.js';
import { ScanWorker } from './scan-worker.js';
import type {
  OwnedGame,
  StoredVersion,
  VersionsRepository,
} from './versions.repository.js';
import { VersionsService } from './versions.service.js';
import { phaser3StarterDocument } from './engine-compiler.js';

type StoredProject = {
  id: string;
  gameId: string;
  templateId: string;
  formatVersion: string;
  document: ReturnType<typeof phaser3StarterDocument>;
  createdAt: Date;
  updatedAt: Date;
};

function versionsRepo(
  game: OwnedGame,
  versions: Map<string, StoredVersion>,
): VersionsRepository {
  return {
    async create(input) {
      const stored: StoredVersion = {
        id: `ver-${versions.size + 1}`,
        status: 'UPLOADING',
        findings: '',
        createdAt: new Date('2026-09-14T03:00:00.000Z'),
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
    async publish() {
      throw new Error('unused');
    },
  };
}

function fixture() {
  const game: OwnedGame = {
    id: 'game-1',
    ownerId: 'owner-1',
    visibility: 'DRAFT',
    moderationState: 'CLEAR',
    activeVersionId: null,
  };
  const projects = new Map<string, StoredProject>();
  const versions = new Map<string, StoredVersion>();
  const storage = new MemoryObjectStorage();
  const repo: ProjectsRepository = {
    async findGame(id) {
      return id === game.id ? { id: game.id, ownerId: game.ownerId } : null;
    },
    async findByGameId(gameId) {
      return [...projects.values()].find((row) => row.gameId === gameId) ?? null;
    },
    async create(input) {
      if ([...projects.values()].some((row) => row.gameId === input.gameId)) {
        throw { code: 'P2002', meta: { target: ['gameId'] } };
      }
      const stored: StoredProject = {
        id: `proj-${projects.size + 1}`,
        createdAt: new Date('2026-09-14T03:00:00.000Z'),
        updatedAt: new Date('2026-09-14T03:00:00.000Z'),
        ...input,
      };
      projects.set(stored.id, stored);
      return stored;
    },
    async save(project) {
      projects.set(project.id, { ...project, updatedAt: new Date('2026-09-14T03:10:00.000Z') });
      return projects.get(project.id)!;
    },
  };
  const versionsService = new VersionsService(
    versionsRepo(game, versions),
    storage,
    new ScanWorker(versionsRepo(game, versions), storage),
  );
  return {
    service: new ProjectsService(repo, versionsService),
    versions,
  };
}

describe('ProjectsService', () => {
  it('creates a Phaser starter project for the owning developer', async () => {
    const { service } = fixture();
    const created = await service.create('game-1', 'owner-1', {
      template: 'phaser3-starter',
    });
    expect(created.templateId).toBe('phaser3-starter');
    expect(created.document.engine).toBe('phaser3');
    expect(created.document.entryScene).toBe('Main');
  });

  it('does not create a project for another developer', async () => {
    const { service } = fixture();
    await expect(
      service.create('game-1', 'owner-2', { template: 'phaser3-starter' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not create a second project for the same game', async () => {
    const { service } = fixture();
    await service.create('game-1', 'owner-1', { template: 'phaser3-starter' });
    await expect(
      service.create('game-1', 'owner-1', { template: 'phaser3-starter' }),
    ).rejects.toThrow(ConflictException);
  });

  it('saves an updated document and returns preview HTML', async () => {
    const { service } = fixture();
    const created = await service.create('game-1', 'owner-1', {
      template: 'phaser3-starter',
    });
    const document = {
      ...created.document,
      scenes: created.document.scenes.map((scene) => ({
        ...scene,
        objects: scene.objects.map((item) =>
          item.id === 'player' ? { ...item, color: '#ff8800' } : item,
        ),
      })),
    };
    const saved = await service.update('game-1', 'owner-1', { document });
    expect(saved.document.scenes[0]?.objects[0]?.color).toBe('#ff8800');
    const preview = await service.preview('game-1', 'owner-1');
    expect(preview.html).toContain('#ff8800');
    expect(preview.html).toContain('requestAnimationFrame');
  });

  it('builds a scanned READY html5 zip from the project', async () => {
    const { service } = fixture();
    await service.create('game-1', 'owner-1', { template: 'phaser3-starter' });
    const built = await service.build('game-1', 'owner-1');
    expect(built.status).toBe('READY');
    expect(built.filename).toBe('engine.zip');
  });
});
