import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ReportsService,
  type ReportGame,
  type ReportsRepository,
  type StoredReport,
} from './reports.service.js';

const game: ReportGame = {
  id: 'game-1',
  slug: 'orbit-orchard',
  title: 'Orbit Orchard',
  ownerId: 'owner-1',
  visibility: 'PUBLIC',
  moderationState: 'CLEAR',
  moderationReason: '',
};

function repo(
  rows: Map<string, StoredReport>,
  current: ReportGame,
): ReportsRepository {
  return {
    async findPublicGame(slug) {
      return slug === current.slug ? { ...current } : null;
    },
    async findOpenByReporter(gameId, reporterId) {
      return (
        [...rows.values()].find(
          (row) =>
            row.gameId === gameId &&
            row.reporterId === reporterId &&
            (row.status === 'OPEN' || row.status === 'APPEALED'),
        ) ?? null
      );
    },
    async findById(id) {
      const row = rows.get(id);
      return row ? { ...row, game: { ...row.game } } : null;
    },
    async create(input) {
      const stored: StoredReport = {
        id: `rep-${rows.size + 1}`,
        status: 'OPEN',
        appealMessage: '',
        resolutionReason: '',
        createdAt: new Date('2026-09-05T12:00:00.000Z'),
        game: { ...current },
        ...input,
      };
      rows.set(stored.id, stored);
      return { ...stored, game: { ...stored.game } };
    },
    async saveReport(report) {
      rows.set(report.id, { ...report, game: { ...report.game } });
      return { ...rows.get(report.id)! };
    },
    async setGameModeration(gameId, state, reason) {
      current.moderationState = state;
      current.moderationReason = reason;
      for (const row of rows.values()) {
        if (row.gameId === gameId) {
          row.game.moderationState = state;
          row.game.moderationReason = reason;
        }
      }
    },
    async listQueue() {
      return [...rows.values()].filter(
        (row) => row.status === 'OPEN' || row.status === 'APPEALED',
      );
    },
    async listForOwner(ownerId) {
      return [...rows.values()].filter((row) => row.game.ownerId === ownerId);
    },
    async countOpen(gameId) {
      return [...rows.values()].filter(
        (row) => row.gameId === gameId && (row.status === 'OPEN' || row.status === 'APPEALED'),
      ).length;
    },
  };
}

describe('ReportsService', () => {
  it('quarantines immediately on a malware report and hides later catalog play', async () => {
    const rows = new Map<string, StoredReport>();
    const current = { ...game };
    const service = new ReportsService(repo(rows, current));
    const created = await service.create('orbit-orchard', 'player-1', {
      category: 'MALWARE',
      evidence: 'This zip dropped an exe after load',
    });
    expect(created.moderationState).toBe('QUARANTINED');
    expect(created.moderationReason).toContain('exe');
  });

  it('flags lower-confidence reports until a moderator dismisses or quarantines', async () => {
    const rows = new Map<string, StoredReport>();
    const current = { ...game };
    const service = new ReportsService(repo(rows, current));
    const created = await service.create('orbit-orchard', 'player-1', {
      category: 'MISLEADING',
      evidence: 'The page promises a different game',
    });
    expect(created.moderationState).toBe('FLAGGED');
    const dismissed = await service.dismiss(created.id, 'Not misleading');
    expect(dismissed.status).toBe('DISMISSED');
    expect(dismissed.moderationState).toBe('CLEAR');
  });

  it('lets the creator appeal a quarantine and a moderator restore it', async () => {
    const rows = new Map<string, StoredReport>();
    const current = { ...game };
    const service = new ReportsService(repo(rows, current));
    const created = await service.create('orbit-orchard', 'player-1', {
      category: 'MALWARE',
      evidence: 'Malware sample attached here',
    });
    await expect(
      service.appeal(created.id, 'player-1', 'I do not own this game wait'),
    ).rejects.toThrow(ForbiddenException);
    const appealed = await service.appeal(
      created.id,
      'owner-1',
      'False positive, build is a puzzle game',
    );
    expect(appealed.status).toBe('APPEALED');
    const restored = await service.restore(created.id, 'Appealed successfully');
    expect(restored.status).toBe('RESTORED');
    expect(restored.moderationState).toBe('CLEAR');
  });
});
