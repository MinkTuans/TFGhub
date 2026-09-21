import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GamesService, type GamesRepository } from './games.service.js';
import { EngineProjectV2 } from '@indieforge/engine-core';
import { createHash } from 'node:crypto';
import { ArtifactStorage } from '../game-artifacts/artifact-storage.js';
import { CoverStorage } from '../game-covers/cover-storage.js';

const storedGame = {
  id: 'game-1',
  ownerId: 'owner-1',
  slug: 'demo-game',
  title: 'Demo game',
  description: 'A draft game',
  visibility: 'DRAFT' as const,
  accessMode: 'GUEST_ALLOWED' as const,
  moderationState: 'CLEAR' as const,
  createdAt: new Date('2026-09-05T12:00:00.000Z'),
  updatedAt: new Date('2026-09-05T12:00:00.000Z'),
  sourceType: 'UPLOAD' as const,
  reviewState: 'DRAFT' as const,
  projectData: null,
  artifactVersion: 0,
  artifactReady: false,
  coverVersion: 0,
  coverContentType: null,
  viewportWidth: 16,
  viewportHeight: 9,
  reviewNote: null,
  submittedAt: null,
  reviewedAt: null,
};

function fixture() {
  const hideOwned = vi.fn().mockResolvedValue(storedGame);
  const deleteOwned = vi.fn().mockResolvedValue(true);
  const artifacts = { removeGame: vi.fn().mockResolvedValue(undefined) };
  const covers = { removeGame: vi.fn().mockResolvedValue(undefined) };
  const games: GamesRepository = {
    createEngineProject: vi.fn(async (input) => ({
      game: {
        ...storedGame,
        ownerId: input.ownerId,
        title: input.title,
        slug: input.slug,
        sourceType: 'ENGINE',
      },
      revision: {
        id: 'revision-1',
        projectId: input.document.projectId,
        revisionNumber: 0,
        schemaVersion: 2,
        document: input.document,
        contentHash: input.contentHash,
        byteSize: input.byteSize,
        retention: 'PINNED',
        createdAt: storedGame.createdAt,
      },
    })),
    updateCover: vi.fn(),
    create: vi.fn().mockResolvedValue(storedGame),
    findManyByOwner: vi.fn().mockResolvedValue([storedGame]),
    findPending: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(storedGame),
    lockForArtifactReconciliation: vi.fn().mockResolvedValue(storedGame),
    updateOwned: vi.fn().mockResolvedValue(storedGame),
    submit: vi.fn().mockResolvedValue(storedGame),
    approve: vi.fn().mockResolvedValue(storedGame),
    reject: vi.fn().mockResolvedValue(storedGame),
    findBySlug: vi.fn().mockResolvedValue(storedGame),
    updateWorkspace: vi.fn().mockResolvedValue(storedGame),
    hideOwned,
    deleteOwned,
  };
  return {
    service: new GamesService(
      games,
      artifacts as unknown as ArtifactStorage,
      covers as unknown as CoverStorage,
    ),
    games,
    artifacts,
    covers,
  };
}

describe('GamesService', () => {
  it('creates a valid empty V2 snapshot with matching bytes, hash and owner', async () => {
    const { service, games } = fixture();
    expect(service.createEngineProject).toBeTypeOf('function');
    const result = await service.createEngineProject('owner-1', {
      title: 'Game chưa có tên',
    });
    expect(result.game).toMatchObject({
      sourceType: 'ENGINE',
      title: 'Game chưa có tên',
      projectData: null,
    });
    const document = EngineProjectV2.parse(result.project.project);
    expect(document.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(document).toMatchObject({
      schemaVersion: 2,
      assetIds: [],
      events: [],
      prefabs: [],
      modules: [],
      scripts: [],
      variables: { global: [], player: [], scene: {} },
    });
    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0].id).toBe(document.entrySceneId);
    expect(document.scenes[0].objects).toEqual([]);
    const write = vi.mocked(games.createEngineProject).mock.calls[0][0];
    expect(write.ownerId).toBe('owner-1');
    expect(write.slug).toMatch(/^game-chua-co-ten-[a-z0-9-]+$/);
    const serialized = JSON.stringify(write.document);
    expect(result.project.revision).toMatchObject({
      revisionNumber: 0,
      schemaVersion: 2,
      retention: 'PINNED',
      byteSize: Buffer.byteLength(serialized),
      contentHash: createHash('sha256').update(serialized).digest('hex'),
    });
  });

  it('retries a slug collision with a new slug and the same project identity', async () => {
    const { service, games } = fixture();
    expect(service.createEngineProject).toBeTypeOf('function');
    vi.mocked(games.createEngineProject).mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['slug'] },
    });
    const result = await service.createEngineProject('owner-1', {
      title: 'Draft',
    });
    const [first, second] = vi
      .mocked(games.createEngineProject)
      .mock.calls.map(([input]) => input);
    expect(first.slug).not.toBe(second.slug);
    expect(first.document).toEqual(second.document);
    expect(result.game.slug).toBe(second.slug);
  });

  it.each([
    new Error('Revision insert failed'),
    { code: 'P2002', meta: { target: ['projectId', 'revisionNumber'] } },
  ])(
    'propagates non-slug creation failures without retrying',
    async (error) => {
      const { service, games } = fixture();
      expect(service.createEngineProject).toBeTypeOf('function');
      vi.mocked(games.createEngineProject).mockRejectedValueOnce(error);
      await expect(
        service.createEngineProject('owner-1', { title: 'Draft' }),
      ).rejects.toBe(error);
      expect(games.createEngineProject).toHaveBeenCalledTimes(1);
    },
  );

  it('creates a draft with clear moderation regardless of client-supplied protected fields', async () => {
    const { service, games } = fixture();

    const result = await service.create('owner-1', {
      title: ' Demo game ',
      slug: 'demo-game',
      description: ' A draft game ',
      accessMode: 'AUTH_REQUIRED',
      viewportWidth: 16,
      viewportHeight: 9,
      ownerId: 'other-user',
      visibility: 'PUBLIC',
      moderationState: 'FLAGGED',
    } as never);

    expect(games.create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      slug: 'demo-game',
      title: ' Demo game ',
      description: ' A draft game ',
      accessMode: 'AUTH_REQUIRED',
      visibility: 'DRAFT',
      moderationState: 'CLEAR',
      viewportWidth: 16,
      viewportHeight: 9,
    });
    expect(result).toEqual({
      id: 'game-1',
      slug: 'demo-game',
      title: 'Demo game',
      description: 'A draft game',
      visibility: 'DRAFT',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      sourceType: 'UPLOAD',
      reviewState: 'DRAFT',
      projectData: null,
      artifactVersion: 0,
      artifactReady: false,
      coverVersion: 0,
      coverContentType: null,
      viewportWidth: 16,
      viewportHeight: 9,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
    });
  });

  it('does not update another developer game', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
    });

    await expect(
      service.updateOwned('game-1', 'owner-2', { title: 'Changed' }),
    ).rejects.toThrow(ForbiddenException);
    expect(games.updateOwned).not.toHaveBeenCalled();
  });

  it('updates only the owning developer game and returns the dashboard fields', async () => {
    const { service, games } = fixture();
    games.updateOwned.mockResolvedValue({
      ...storedGame,
      title: 'Changed',
      updatedAt: new Date('2026-09-05T12:05:00.000Z'),
    });

    const result = await service.updateOwned('game-1', 'owner-1', {
      title: 'Changed',
    });

    expect(games.updateOwned).toHaveBeenCalledWith(
      'game-1',
      'owner-1',
      storedGame.updatedAt,
      { title: 'Changed' },
    );
    expect(result).toMatchObject({
      id: 'game-1',
      title: 'Changed',
      updatedAt: '2026-09-05T12:05:00.000Z',
    });
  });

  it('returns an approved public game to draft when its owner edits metadata', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
      reviewNote: 'Previously approved',
      submittedAt: new Date('2026-09-05T12:01:00.000Z'),
      reviewedAt: new Date('2026-09-05T12:02:00.000Z'),
    });

    await service.updateOwned('game-1', 'owner-1', { title: 'Changed' });

    expect(games.updateOwned).toHaveBeenCalledWith(
      'game-1',
      'owner-1',
      expect.any(Date),
      {
        title: 'Changed',
        visibility: 'DRAFT',
        reviewState: 'DRAFT',
        reviewNote: null,
        submittedAt: null,
        reviewedAt: null,
      },
    );
  });

  it('invalidates a pending review when its owner edits metadata', async () => {
    const { service, games } = fixture();
    games.findUnique.mockResolvedValue({
      ...storedGame,
      reviewState: 'PENDING',
      artifactVersion: 2,
      artifactReady: true,
      submittedAt: new Date('2026-09-05T12:01:00.000Z'),
    });

    await service.updateOwned('game-1', 'owner-1', { title: 'Changed' });

    expect(games.updateOwned).toHaveBeenCalledWith(
      'game-1',
      'owner-1',
      storedGame.updatedAt,
      expect.objectContaining({
        title: 'Changed',
        visibility: 'DRAFT',
        reviewState: 'DRAFT',
        submittedAt: null,
      }),
    );
  });

  it('does not overwrite a moderator approval that happens after the owner read', async () => {
    const { service, games } = fixture();
    const observedAt = new Date('2026-09-05T12:00:00.000Z');
    let persisted = {
      ...storedGame,
      title: 'Original title',
      reviewState: 'PENDING' as const,
      artifactVersion: 1,
      updatedAt: observedAt,
    };
    vi.mocked(games.findUnique).mockResolvedValue({ ...persisted });
    games.updateOwned.mockImplementation(
      async (_id: string, _ownerId: string, expectedUpdatedAt: Date) => {
        persisted = {
          ...persisted,
          reviewState: 'APPROVED',
          visibility: 'PUBLIC',
          updatedAt: new Date('2026-09-05T12:02:00.000Z'),
        } as typeof persisted;
        return persisted.updatedAt.getTime() === expectedUpdatedAt.getTime()
          ? persisted
          : null;
      },
    );

    await expect(
      service.updateOwned('game-1', 'owner-1', { title: 'Edited title' }),
    ).rejects.toThrow(ConflictException);
    expect(persisted).toMatchObject({
      title: 'Original title',
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
    });
  });

  it('submits an owned game only when it has an artifact', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
      artifactVersion: 1,
      artifactReady: true,
    });
    vi.mocked(games.submit).mockResolvedValue({
      ...storedGame,
      artifactVersion: 1,
      artifactReady: true,
      reviewState: 'PENDING',
      submittedAt: new Date('2026-09-05T12:01:00.000Z'),
    });

    await expect(
      service.submitOwned('game-1', 'owner-1'),
    ).resolves.toMatchObject({
      reviewState: 'PENDING',
      artifactVersion: 1,
    });
    expect(games.submit).toHaveBeenCalledWith('game-1');
  });

  it('does not submit an artifact-free game', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({ ...storedGame });

    await expect(service.submitOwned('game-1', 'owner-1')).rejects.toThrow(
      ConflictException,
    );
    expect(games.submit).not.toHaveBeenCalled();
  });

  it('does not submit a stale artifact after source has been saved', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
      artifactVersion: 1,
      artifactReady: false,
    });

    await expect(service.submitOwned('game-1', 'owner-1')).rejects.toThrow(
      ConflictException,
    );
    expect(games.submit).not.toHaveBeenCalled();
  });

  it('hides an owned public game by returning it to a draft', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
      visibility: 'PUBLIC',
      reviewState: 'APPROVED',
    });
    vi.mocked(games.hideOwned).mockResolvedValue({
      ...storedGame,
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
    });

    await expect(service.hideOwned('game-1', 'owner-1')).resolves.toMatchObject({
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
    });
    expect(games.hideOwned).toHaveBeenCalledWith(
      'game-1',
      'owner-1',
      storedGame.updatedAt,
    );
  });

  it('does not write a game that is already a draft when hiding it', async () => {
    const { service, games } = fixture();

    await expect(service.hideOwned('game-1', 'owner-1')).resolves.toMatchObject({
      id: 'game-1',
      visibility: 'DRAFT',
    });
    expect(games.hideOwned).not.toHaveBeenCalled();
  });

  it('permanently deletes only an owned draft then attempts both file cleanups', async () => {
    const { service, games, artifacts, covers } = fixture();

    await expect(service.deleteOwned('game-1', 'owner-1')).resolves.toBeUndefined();
    expect(games.deleteOwned).toHaveBeenCalledWith('game-1', 'owner-1');
    expect(artifacts.removeGame).toHaveBeenCalledWith('game-1');
    expect(covers.removeGame).toHaveBeenCalledWith('game-1');
  });

  it('rejects permanent deletion of a non-draft game before deleting its row', async () => {
    const { service, games } = fixture();
    vi.mocked(games.findUnique).mockResolvedValue({
      ...storedGame,
      visibility: 'PUBLIC',
      reviewState: 'APPROVED',
    });

    await expect(service.deleteOwned('game-1', 'owner-1')).rejects.toThrow(
      ConflictException,
    );
    expect(games.deleteOwned).not.toHaveBeenCalled();
  });

  it('maps only a duplicate slug violation to conflict', async () => {
    const { service, games } = fixture();
    vi.mocked(games.create).mockRejectedValue({
      code: 'P2002',
      meta: { target: ['slug'] },
    });

    await expect(
      service.create('owner-1', {
        title: 'Demo game',
        slug: 'demo-game',
        description: '',
        accessMode: 'GUEST_ALLOWED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    { code: 'P2002', meta: { target: ['id'] } },
    new Error('Database connection lost'),
  ])(
    'propagates the original non-slug persistence error: %j',
    async (error) => {
      const { service, games } = fixture();
      vi.mocked(games.create).mockRejectedValue(error);

      await expect(
        service.create('owner-1', {
          title: 'Demo game',
          slug: 'demo-game',
          description: '',
          accessMode: 'GUEST_ALLOWED',
        }),
      ).rejects.toBe(error);
    },
  );
});
