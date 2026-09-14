import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  GameAnalyticsSummary,
  PlayHeartbeatInput,
  PlaySessionSummary,
} from '@indieforge/contracts';

const RELOAD_WINDOW_MS = 10_000;
const HEARTBEAT_GAP_MS = 10_000;
const COUNTED_SECONDS = 15;
const BURST_LIMIT = 6;

export type AnalyticsGame = {
  id: string;
  slug: string;
  title: string;
  ownerId: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
};

export type StoredSession = {
  id: string;
  gameId: string;
  gameSlug: string;
  visitorId: string;
  valid: boolean;
  countedSeconds: number;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
};

export type StoredHeartbeat = {
  eventId: string;
  sessionId: string;
  visible: boolean;
  active: boolean;
  counted: boolean;
  createdAt: Date;
};

export abstract class AnalyticsRepository {
  abstract findPublicGame(slug: string): Promise<AnalyticsGame | null>;
  abstract findRecentSession(
    gameId: string,
    visitorId: string,
    after: Date,
  ): Promise<StoredSession | null>;
  abstract findSession(id: string): Promise<StoredSession | null>;
  abstract createSession(input: {
    gameId: string;
    gameSlug: string;
    visitorId: string;
  }): Promise<StoredSession>;
  abstract saveSession(session: StoredSession): Promise<StoredSession>;
  abstract findHeartbeat(eventId: string): Promise<StoredHeartbeat | null>;
  abstract addHeartbeat(input: StoredHeartbeat): Promise<StoredHeartbeat>;
  abstract countRecentHeartbeats(sessionId: string, after: Date): Promise<number>;
  abstract listOwnerGames(ownerId: string): Promise<
    Array<{
      id: string;
      slug: string;
      title: string;
      validPlays: number;
      countedSeconds: number;
    }>
  >;
}

export function allocationScore(
  plays: number,
  minutes: number,
  maxPlays: number,
  maxMinutes: number,
): number {
  const normalizedPlays = maxPlays === 0 ? 0 : plays / maxPlays;
  const normalizedMinutes = maxMinutes === 0 ? 0 : minutes / maxMinutes;
  return Number((0.3 * normalizedPlays + 0.7 * normalizedMinutes).toFixed(4));
}

function summary(session: StoredSession): PlaySessionSummary {
  return { id: session.id, gameSlug: session.gameSlug };
}

@Injectable()
export class AnalyticsService {
  now: () => Date = () => new Date();

  constructor(
    @Inject(AnalyticsRepository)
    private readonly analytics: AnalyticsRepository,
  ) {}

  async startSession(
    input: { gameSlug: string; visitorId: string },
    userId: string | null,
  ): Promise<PlaySessionSummary> {
    const game = await this.analytics.findPublicGame(input.gameSlug);
    if (
      !game ||
      game.visibility !== 'PUBLIC' ||
      game.moderationState !== 'CLEAR'
    ) {
      throw new NotFoundException('Game not found');
    }
    if (game.accessMode === 'AUTH_REQUIRED' && !userId) {
      throw new UnauthorizedException();
    }
    const recent = await this.analytics.findRecentSession(
      game.id,
      input.visitorId,
      new Date(this.now().getTime() - RELOAD_WINDOW_MS),
    );
    if (recent) return summary(recent);
    return summary(
      await this.analytics.createSession({
        gameId: game.id,
        gameSlug: game.slug,
        visitorId: input.visitorId,
      }),
    );
  }

  async heartbeat(
    sessionId: string,
    input: PlayHeartbeatInput,
  ): Promise<{ counted: boolean }> {
    const existing = await this.analytics.findHeartbeat(input.eventId);
    if (existing) return { counted: existing.counted };
    const session = await this.analytics.findSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    const occurred = new Date(input.occurredAt);
    const now = this.now();
    const burst = await this.analytics.countRecentHeartbeats(
      sessionId,
      new Date(now.getTime() - HEARTBEAT_GAP_MS),
    );
    if (burst >= BURST_LIMIT) {
      session.valid = false;
      await this.analytics.saveSession(session);
    }
    const inWindow =
      occurred.getTime() <= now.getTime() + 5_000 &&
      occurred.getTime() >= now.getTime() - 120_000;
    const spaced =
      !session.lastHeartbeatAt ||
      occurred.getTime() - session.lastHeartbeatAt.getTime() >= HEARTBEAT_GAP_MS;
    const counted =
      session.valid &&
      input.visible &&
      input.active &&
      inWindow &&
      spaced;
    await this.analytics.addHeartbeat({
      eventId: input.eventId,
      sessionId,
      visible: input.visible,
      active: input.active,
      counted,
      createdAt: occurred,
    });
    if (counted) {
      session.countedSeconds += COUNTED_SECONDS;
      session.lastHeartbeatAt = occurred;
      await this.analytics.saveSession(session);
    }
    return { counted };
  }

  async studio(ownerId: string): Promise<{ games: GameAnalyticsSummary[] }> {
    const games = await this.analytics.listOwnerGames(ownerId);
    const maxPlays = Math.max(0, ...games.map((game) => game.validPlays));
    const minutes = games.map((game) => game.countedSeconds / 60);
    const maxMinutes = Math.max(0, ...minutes);
    return {
      games: games.map((game, index) => ({
        gameId: game.id,
        slug: game.slug,
        title: game.title,
        validPlays: game.validPlays,
        validActiveMinutes: Number(minutes[index]!.toFixed(2)),
        score: allocationScore(
          game.validPlays,
          minutes[index]!,
          maxPlays,
          maxMinutes,
        ),
      })),
    };
  }
}
