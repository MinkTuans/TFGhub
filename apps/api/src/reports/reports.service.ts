import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReportInput,
  ReportSummary,
} from '@indieforge/contracts';

const HIGH_CONFIDENCE = new Set(['MALWARE']);

export type ReportGame = {
  id: string;
  slug: string;
  title: string;
  ownerId: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  moderationReason: string;
};

export type StoredReport = {
  id: string;
  gameId: string;
  reporterId: string;
  category: CreateReportInput['category'];
  evidence: string;
  status: 'OPEN' | 'DISMISSED' | 'APPEALED' | 'RESTORED';
  appealMessage: string;
  resolutionReason: string;
  createdAt: Date;
  game: ReportGame;
};

export abstract class ReportsRepository {
  abstract findPublicGame(slug: string): Promise<ReportGame | null>;
  abstract findOpenByReporter(gameId: string, reporterId: string): Promise<StoredReport | null>;
  abstract findById(id: string): Promise<StoredReport | null>;
  abstract create(input: {
    gameId: string;
    reporterId: string;
    category: CreateReportInput['category'];
    evidence: string;
  }): Promise<StoredReport>;
  abstract saveReport(report: StoredReport): Promise<StoredReport>;
  abstract setGameModeration(
    gameId: string,
    state: ReportGame['moderationState'],
    reason: string,
  ): Promise<void>;
  abstract listQueue(): Promise<StoredReport[]>;
  abstract listForOwner(ownerId: string): Promise<StoredReport[]>;
  abstract countOpen(gameId: string): Promise<number>;
}

function summary(report: StoredReport): ReportSummary {
  return {
    id: report.id,
    gameId: report.gameId,
    gameSlug: report.game.slug,
    gameTitle: report.game.title,
    category: report.category,
    evidence: report.evidence,
    status: report.status,
    moderationState: report.game.moderationState,
    moderationReason: report.game.moderationReason,
    appealMessage: report.appealMessage,
    resolutionReason: report.resolutionReason,
    createdAt: report.createdAt.toISOString(),
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(ReportsRepository) private readonly reports: ReportsRepository,
  ) {}

  async create(
    slug: string,
    reporterId: string,
    input: CreateReportInput,
  ): Promise<ReportSummary> {
    const game = await this.reports.findPublicGame(slug);
    if (!game || game.visibility !== 'PUBLIC') {
      throw new NotFoundException('Game not found');
    }
    if (game.ownerId === reporterId) {
      throw new ForbiddenException('You cannot report your own game');
    }
    const existing = await this.reports.findOpenByReporter(game.id, reporterId);
    if (existing) return summary(existing);
    const report = await this.reports.create({
      gameId: game.id,
      reporterId,
      category: input.category,
      evidence: input.evidence,
    });
    if (HIGH_CONFIDENCE.has(input.category)) {
      await this.reports.setGameModeration(game.id, 'QUARANTINED', input.evidence);
      report.game.moderationState = 'QUARANTINED';
      report.game.moderationReason = input.evidence;
    } else if (game.moderationState === 'CLEAR') {
      await this.reports.setGameModeration(game.id, 'FLAGGED', input.evidence);
      report.game.moderationState = 'FLAGGED';
      report.game.moderationReason = input.evidence;
    }
    return summary(report);
  }

  listQueue(): Promise<ReportSummary[]> {
    return this.reports.listQueue().then((rows) => rows.map(summary));
  }

  listForOwner(ownerId: string): Promise<ReportSummary[]> {
    return this.reports.listForOwner(ownerId).then((rows) => rows.map(summary));
  }

  async quarantine(id: string, reason: string): Promise<ReportSummary> {
    const report = await this.requireOpen(id);
    await this.reports.setGameModeration(report.gameId, 'QUARANTINED', reason);
    report.game.moderationState = 'QUARANTINED';
    report.game.moderationReason = reason;
    report.resolutionReason = reason;
    return summary(await this.reports.saveReport(report));
  }

  async dismiss(id: string, reason: string): Promise<ReportSummary> {
    const report = await this.requireOpen(id);
    report.status = 'DISMISSED';
    report.resolutionReason = reason;
    const open = await this.reports.countOpen(report.gameId);
    if (open <= 1 && report.game.moderationState === 'FLAGGED') {
      await this.reports.setGameModeration(report.gameId, 'CLEAR', '');
      report.game.moderationState = 'CLEAR';
      report.game.moderationReason = '';
    }
    return summary(await this.reports.saveReport(report));
  }

  async appeal(id: string, ownerId: string, message: string): Promise<ReportSummary> {
    const report = await this.reports.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    if (report.game.ownerId !== ownerId) {
      throw new ForbiddenException('Only the creator can appeal');
    }
    if (report.game.moderationState !== 'QUARANTINED') {
      throw new ForbiddenException('This game is not quarantined');
    }
    report.status = 'APPEALED';
    report.appealMessage = message;
    return summary(await this.reports.saveReport(report));
  }

  async restore(id: string, reason: string): Promise<ReportSummary> {
    const report = await this.reports.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    await this.reports.setGameModeration(report.gameId, 'CLEAR', '');
    report.status = 'RESTORED';
    report.resolutionReason = reason;
    report.game.moderationState = 'CLEAR';
    report.game.moderationReason = '';
    return summary(await this.reports.saveReport(report));
  }

  private async requireOpen(id: string): Promise<StoredReport> {
    const report = await this.reports.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'OPEN' && report.status !== 'APPEALED') {
      throw new ForbiddenException('Report is already resolved');
    }
    return report;
  }
}
