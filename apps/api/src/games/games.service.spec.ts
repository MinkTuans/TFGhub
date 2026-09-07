import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GamesService, type GamesRepository } from './games.service.js';

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
  reviewNote: null,
  submittedAt: null,
  reviewedAt: null,
};

function fixture() {
  const games: GamesRepository = {
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
  };
  return { service: new GamesService(games), games };
}

describe('GamesService', () => {
  it('creates a draft with clear moderation regardless of client-supplied protected fields', async () => {
    const { service, games } = fixture();

    const result = await service.create('owner-1', {
      title: ' Demo game ',
      slug: 'demo-game',
      description: ' A draft game ',
      accessMode: 'AUTH_REQUIRED',
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
