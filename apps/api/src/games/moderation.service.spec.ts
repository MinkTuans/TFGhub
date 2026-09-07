import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type GamesRepository } from './games.service.js';
import { ModerationService } from './moderation.service.js';

const pendingGame = {
  id: 'game-1',
  ownerId: 'owner-1',
  creator: { id: 'owner-1', displayName: null },
  slug: 'demo-game',
  title: 'Demo game',
  description: 'A pending game',
  visibility: 'DRAFT' as const,
  accessMode: 'GUEST_ALLOWED' as const,
  moderationState: 'CLEAR' as const,
  createdAt: new Date('2026-09-05T12:00:00.000Z'),
  updatedAt: new Date('2026-09-05T12:00:00.000Z'),
  sourceType: 'UPLOAD' as const,
  reviewState: 'PENDING' as const,
  projectData: { unpublishedSource: 'MODERATION_SOURCE_SENTINEL' },
  artifactVersion: 1,
  reviewNote: null,
  submittedAt: new Date('2026-09-05T12:01:00.000Z'),
  reviewedAt: null,
};

function fixture() {
  const games = {
    findPending: vi.fn().mockResolvedValue([pendingGame]),
    approve: vi.fn().mockResolvedValue({
      ...pendingGame,
      reviewState: 'APPROVED' as const,
      visibility: 'PUBLIC' as const,
      reviewedAt: new Date('2026-09-05T12:02:00.000Z'),
    }),
    reject: vi.fn().mockResolvedValue({
      ...pendingGame,
      reviewState: 'REJECTED' as const,
      reviewNote: 'Needs a title screen',
      reviewedAt: new Date('2026-09-05T12:02:00.000Z'),
    }),
  } as Pick<GamesRepository, 'findPending' | 'approve' | 'reject'>;
  return {
    service: new ModerationService(games as GamesRepository),
    games,
  };
}

describe('ModerationService', () => {
  it('returns the pending review queue', async () => {
    const { service } = fixture();

    const result = await service.pending();
    expect(result).toMatchObject([
      { id: 'game-1', reviewState: 'PENDING', artifactVersion: 1 },
    ]);
    expect(result[0]).not.toHaveProperty('projectData');
    expect(result[0]).toMatchObject({
      creator: { id: 'owner-1', displayName: null },
    });
  });

  it('publishes an artifact only when its review is still pending', async () => {
    const { service, games } = fixture();

    const result = await service.approve('game-1');
    expect(result).toMatchObject({
      reviewState: 'APPROVED',
      visibility: 'PUBLIC',
      artifactVersion: 1,
    });
    expect(result).not.toHaveProperty('projectData');
    expect(games.approve).toHaveBeenCalledWith('game-1');
  });

  it('returns conflict instead of reviewing an already-handled game', async () => {
    const { service, games } = fixture();
    games.approve.mockResolvedValue(null);

    await expect(service.approve('game-1')).rejects.toThrow(ConflictException);
  });

  it('rejects a pending game with a trimmed moderator note', async () => {
    const { service, games } = fixture();

    const result = await service.reject('game-1', '  Needs a title screen  ');
    expect(result).toMatchObject({
      reviewState: 'REJECTED',
      visibility: 'DRAFT',
    });
    expect(result).not.toHaveProperty('projectData');
    expect(games.reject).toHaveBeenCalledWith('game-1', 'Needs a title screen');
  });
});
