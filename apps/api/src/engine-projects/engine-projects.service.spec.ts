import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  EngineProjectV1,
  upgradeEngineProjectV1,
} from '@indieforge/engine-core';
import {
  EngineProjectsRepository,
  type EngineProjectRecord,
} from './engine-projects.repository.js';
import { EngineProjectsService } from './engine-projects.service.js';

const ids = {
  project: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  scene: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  asset: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  scene2: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

const canonicalProject = {
  schemaVersion: 1,
  projectId: ids.project,
  engineFamily: 'TFG_ENGINE',
  entrySceneId: ids.scene,
  settings: { viewport: { width: 640, height: 480 } },
  assetIds: [ids.asset],
  scenes: [
    {
      id: ids.scene,
      name: 'Scene',
      order: 0,
      objects: [],
    },
  ],
  variables: { global: [], player: [], scene: {} },
  events: [],
  prefabs: [],
};

function revision(document: unknown = canonicalProject) {
  return {
    id: 'revision-1',
    projectId: 'stored-project',
    revisionNumber: 1,
    schemaVersion: 1,
    document,
    contentHash: 'a'.repeat(64),
    byteSize: 100,
    retention: 'STANDARD' as const,
    createdAt: new Date('2026-09-09T00:00:00.000Z'),
  };
}

function setup(
  record:
    | (Omit<EngineProjectRecord, 'gameUpdatedAt'> & { gameUpdatedAt?: Date })
    | null,
) {
  const stored = record
    ? {
        ...record,
        gameUpdatedAt:
          record.gameUpdatedAt ?? new Date('2026-09-09T00:00:00.000Z'),
      }
    : null;
  const repository = {
    findGameProject: vi.fn(async () => stored),
    materialize: vi.fn(async () => revision()),
    saveRevision: vi.fn(async () => ({
      status: 'SAVED' as const,
      revision: revision(),
    })),
    compactStandardRevisions: vi.fn(async () => undefined),
  } as unknown as EngineProjectsRepository;
  return { repository, service: new EngineProjectsService(repository) };
}

describe('EngineProjectsService', () => {
  it('returns the stored mutation result instead of the later project head, even if compaction fails', async () => {
    const document = upgradeEngineProjectV1(
      EngineProjectV1.parse(canonicalProject),
    );
    const authoritative = { ...revision(document), schemaVersion: 2 };
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'ENGINE',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 5,
        headRevision: { ...authoritative, revisionNumber: 5 },
      },
    });
    Object.assign(repository, {
      applyMutationBatch: async () => ({
        status: 'SAVED',
        revision: authoritative,
      }),
    });
    vi.mocked(repository.compactStandardRevisions).mockRejectedValue(
      new Error('cleanup failed'),
    );
    expect(service.applyMutationBatch).toBeTypeOf('function');
    await expect(
      service.applyMutationBatch('game-1', 'owner-1', {
        mutationId: 'replay',
        baseRevision: 0,
        mutations: [
          { type: 'scene.rename', sceneId: ids.scene, name: 'Ignored replay' },
        ],
      }),
    ).resolves.toEqual({
      status: 'SUPPORTED',
      project: document,
      revision: {
        revisionNumber: 1,
        schemaVersion: 2,
        contentHash: 'a'.repeat(64),
        byteSize: 100,
        retention: 'STANDARD',
        createdAt: '2026-09-09T00:00:00.000Z',
      },
    });
  });

  it('maps a stale mutation batch to the existing machine-readable conflict shape', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'ENGINE',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 1,
        headRevision: revision(),
      },
    });
    Object.assign(repository, {
      applyMutationBatch: async () => ({
        status: 'CONFLICT',
        currentRevision: 7,
      }),
    });
    expect(service.applyMutationBatch).toBeTypeOf('function');
    await expect(
      service.applyMutationBatch('game-1', 'owner-1', {
        mutationId: 'stale',
        baseRevision: 0,
        mutations: [
          { type: 'scene.rename', sceneId: ids.scene, name: 'Changed' },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'PROJECT_REVISION_CONFLICT',
        currentRevision: 7,
      },
    });
  });

  it('rejects a non-owner before reading project data', async () => {
    const { service } = setup({
      gameId: 'game-1',
      ownerId: 'owner-2',
      sourceType: 'STORY',
      projectData: null,
      project: null,
    });

    await expect(service.read('game-1', 'owner-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('preserves a future revision as a read-only response', async () => {
    const raw = { schemaVersion: 4, futureField: { untouched: true } };
    const { service } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: null,
      project: {
        id: 'stored-project',
        headRevisionNumber: 1,
        headRevision: revision(raw),
      },
    });

    await expect(service.read('game-1', 'owner-1')).resolves.toEqual({
      status: 'READ_ONLY',
      reason: 'UNSUPPORTED_FUTURE_SCHEMA',
      raw,
      schemaVersion: 4,
      diagnostics: [],
    });
  });

  it('materializes legacy data once as pinned revision zero with exact asset references', async () => {
    const legacy = {
      sourceType: 'STORY',
      startSceneId: 'intro',
      scenes: [
        {
          id: 'intro',
          speaker: 'Guide',
          dialogue: 'Hello',
          backgroundColor: '#112233',
          choices: [],
        },
      ],
    };
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: legacy,
      project: null,
    });

    await service.materialize('game-1', 'owner-1');

    expect(repository.materialize).toHaveBeenCalledOnce();
    expect(repository.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-1',
        authorId: 'owner-1',
        revisionNumber: 0,
        retention: 'PINNED',
        assetIds: [],
        schemaVersion: 1,
      }),
    );
  });

  it('returns the authoritative stored document after an idempotent materialization race', async () => {
    const legacy = {
      sourceType: 'STORY',
      startSceneId: 'intro',
      scenes: [
        {
          id: 'intro',
          speaker: '',
          dialogue: '',
          backgroundColor: '#112233',
          choices: [],
        },
      ],
    };
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: legacy,
      project: null,
    });
    const preview = await service.read('game-1', 'owner-1');
    if (preview.status !== 'SUPPORTED')
      throw new Error('Expected convertible fixture');
    const authoritative = {
      ...(preview.project as typeof canonicalProject),
      settings: { viewport: { width: 800, height: 600 } },
    };
    vi.mocked(repository.materialize).mockResolvedValue(
      revision(authoritative),
    );

    const response = await service.materialize('game-1', 'owner-1');

    expect(response).toMatchObject({
      status: 'SUPPORTED',
      project: authoritative,
    });
  });

  it('rejects CODE legacy materialization without writing a fallback project', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'CODE',
      projectData: { sourceType: 'CODE', html: '', css: '', javascript: '' },
      project: null,
    });

    await expect(
      service.materialize('game-1', 'owner-1'),
    ).resolves.toMatchObject({
      status: 'READ_ONLY',
      reason: 'UNSUPPORTED_LEGACY_SOURCE',
    });
    expect(repository.materialize).not.toHaveBeenCalled();
  });

  it('uses authoritative game source type instead of stale projectData type', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'UPLOAD',
      projectData: {
        sourceType: 'STORY',
        startSceneId: 'intro',
        scenes: [
          {
            id: 'intro',
            speaker: '',
            dialogue: '',
            backgroundColor: '#112233',
            choices: [],
          },
        ],
      },
      project: null,
    });

    await expect(
      service.materialize('game-1', 'owner-1'),
    ).resolves.toMatchObject({
      status: 'READ_ONLY',
      reason: 'UNSUPPORTED_LEGACY_SOURCE',
    });
    expect(repository.materialize).not.toHaveBeenCalled();
  });

  it('hashes equivalent record keys identically', async () => {
    const first = structuredClone(canonicalProject);
    first.scenes.push({
      id: ids.scene2,
      name: 'Second',
      order: 1,
      objects: [],
    });
    first.variables.scene = { [ids.scene]: [], [ids.scene2]: [] };
    const second = structuredClone(first);
    second.variables.scene = { [ids.scene2]: [], [ids.scene]: [] };
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 0,
        headRevision: revision(),
      },
    });

    await service.save('game-1', 'owner-1', {
      baseRevision: 0,
      project: first,
    });
    await service.save('game-1', 'owner-1', {
      baseRevision: 0,
      project: second,
    });

    const calls = vi.mocked(repository.saveRevision).mock.calls;
    expect(calls[0]![0].contentHash).toBe(calls[1]![0].contentHash);
    expect(calls[0]![0].byteSize).toBe(calls[1]![0].byteSize);
  });

  it('passes base revision and complete immutable snapshot to the repository', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 0,
        headRevision: revision(),
      },
    });

    await service.save('game-1', 'owner-1', {
      baseRevision: 0,
      project: canonicalProject,
    });

    expect(repository.saveRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-1',
        projectId: ids.project,
        authorId: 'owner-1',
        baseRevision: 0,
        revisionNumber: 1,
        schemaVersion: 1,
        assetIds: [ids.asset],
      }),
    );
    expect(repository.compactStandardRevisions).toHaveBeenCalledWith(
      ids.project,
      100,
    );
  });

  it('returns the stable conflict code and never falls back after stale CAS', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 0,
        headRevision: revision(),
      },
    });
    vi.mocked(repository.saveRevision).mockResolvedValue({
      status: 'CONFLICT',
      currentRevision: 2,
    });

    await expect(
      service.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: canonicalProject,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'PROJECT_REVISION_CONFLICT',
        currentRevision: 2,
      },
    } as ConflictException);
    expect(repository.saveRevision).toHaveBeenCalledOnce();
    expect(repository.compactStandardRevisions).not.toHaveBeenCalled();
  });

  it('does not fail a committed save when separate best-effort compaction fails', async () => {
    const { service, repository } = setup({
      gameId: 'game-1',
      ownerId: 'owner-1',
      sourceType: 'STORY',
      projectData: null,
      project: {
        id: ids.project,
        headRevisionNumber: 0,
        headRevision: revision(),
      },
    });
    vi.mocked(repository.compactStandardRevisions).mockRejectedValue(
      new Error('cleanup failed'),
    );

    await expect(
      service.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: canonicalProject,
      }),
    ).resolves.toMatchObject({ revisionNumber: 1 });
  });
});
