import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { database } from '@indieforge/database';
import type {
  EngagementComment,
  EngagementComments,
  EngagementStats,
  GameAnalytics,
  GameScoreResult,
  PlaySession,
} from '@indieforge/contracts';
import type { AuthenticatedUser } from '../auth/auth.service.js';
export const ENGAGEMENT_DATABASE = Symbol('ENGAGEMENT_DATABASE');
type Db = typeof database;
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];
type Game = Awaited<ReturnType<Db['game']['findUnique']>> & {};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function digest(value: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be configured');
  return createHmac('sha256', secret)
    .update(`engagement:${value}`)
    .digest('base64url');
}
function eligible(game: Game | null): asserts game is Game {
  if (
    !game ||
    game.visibility !== 'PUBLIC' ||
    game.reviewState !== 'APPROVED' ||
    game.moderationState !== 'CLEAR'
  )
    throw new NotFoundException('Game not found');
}
function owner(
  game: Game | null,
  user: AuthenticatedUser,
): asserts game is Game {
  if (!game) throw new NotFoundException('Game not found');
  if (game.ownerId !== user.id && user.role !== 'ADMIN')
    throw new ForbiddenException();
}
@Injectable()
export class EngagementService {
  constructor(@Inject(ENGAGEMENT_DATABASE) private readonly db: Db) {}
  private async publicGame(slug: string, db: Db | Tx = this.db) {
    const game = await db.game.findUnique({ where: { slug } });
    eligible(game);
    return game;
  }
  private async lockedGame(tx: Tx, slug: string) {
    await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "slug" = ${slug} FOR UPDATE`;
    return this.publicGame(slug, tx);
  }
  async publicStats(slug: string) {
    return this.stats((await this.publicGame(slug)).id);
  }
  private async stats(gameId: string): Promise<EngagementStats> {
    const [plays, unique, ratings, distribution, commentCount, score, game] =
      await Promise.all([
        this.db.gamePlay.aggregate({
          where: { gameId },
          _count: true,
          _avg: { activeSeconds: true },
        }),
        this.db.$queryRaw<
          { count: bigint }[]
        >`SELECT COUNT(DISTINCT "participantKey") AS count FROM "GamePlay" WHERE "gameId" = ${gameId}`,
        this.db.gameRating.aggregate({
          where: { gameId },
          _count: true,
          _avg: { rating: true },
        }),
        this.db.gameRating.groupBy({
          by: ['rating'],
          where: { gameId },
          _count: true,
        }),
        this.db.gameComment.count({ where: { gameId } }),
        this.db.gameScore.aggregate({
          where: { play: { gameId } },
          _max: { score: true },
        }),
        this.db.game.findUniqueOrThrow({
          where: { id: gameId },
          select: { scoresEnabled: true },
        }),
      ]);
    return {
      totalPlays: plays._count,
      uniquePlayers: Number(unique[0]?.count ?? 0),
      averagePlaySeconds: plays._avg.activeSeconds,
      ratingAverage: ratings._avg.rating,
      ratingCount: ratings._count,
      ratingDistribution: [1, 2, 3, 4, 5].map((stars) => ({
        stars,
        count: distribution.find((r) => r.rating === stars)?._count ?? 0,
      })),
      commentCount,
      highScore: game.scoresEnabled ? score._max.score : null,
      scoresEnabled: game.scoresEnabled,
    };
  }
  async viewer(slug: string, user: AuthenticatedUser) {
    const game = await this.publicGame(slug);
    const rating = await this.db.gameRating.findUnique({
      where: { gameId_userId: { gameId: game.id, userId: user.id } },
    });
    return { rating: rating?.rating ?? null };
  }
  async rate(slug: string, user: AuthenticatedUser, rating: number | null) {
    return this.db.$transaction(async (tx) => {
      const game = await this.lockedGame(tx, slug);
      const where = { gameId_userId: { gameId: game.id, userId: user.id } };
      if (rating === null)
        await tx.gameRating.deleteMany({
          where: { gameId: game.id, userId: user.id },
        });
      else
        await tx.gameRating.upsert({
          where,
          create: { gameId: game.id, userId: user.id, rating },
          update: { rating },
        });
    });
  }
  async comments(slug: string, offset: number, limit: number) {
    return this.listComments((await this.publicGame(slug)).id, offset, limit);
  }
  private async listComments(
    gameId: string,
    offset: number,
    limit: number,
  ): Promise<EngagementComments> {
    const [rows, total] = await Promise.all([
      this.db.gameComment.findMany({
        where: { gameId },
        skip: offset,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              profile: { select: { displayName: true } },
              ratings: { where: { gameId }, select: { rating: true } },
            },
          },
        },
      }),
      this.db.gameComment.count({ where: { gameId } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.user.id,
          displayName: row.user.profile?.displayName ?? 'Người chơi',
        },
        rating: row.user.ratings[0]?.rating ?? null,
      })),
      total,
    };
  }
  async comment(
    slug: string,
    user: AuthenticatedUser,
    body: string,
  ): Promise<EngagementComment> {
    return this.db.$transaction(async (tx) => {
      const game = await this.lockedGame(tx, slug);
      const now = new Date();
      const where = { gameId_userId: { gameId: game.id, userId: user.id } };
      const cooldown = await tx.gameCommentCooldown.findUnique({ where });
      if (cooldown && now.getTime() - cooldown.lastCommentAt.getTime() < 30000)
        throw new ConflictException(
          'Please wait 30 seconds before commenting again',
        );
      await tx.gameCommentCooldown.upsert({
        where,
        create: { gameId: game.id, userId: user.id, lastCommentAt: now },
        update: { lastCommentAt: now },
      });
      const row = await tx.gameComment.create({
        data: { gameId: game.id, userId: user.id, body },
        include: {
          user: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
        },
      });
      const rating = await tx.gameRating.findUnique({ where });
      return {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.user.id,
          displayName: row.user.profile?.displayName ?? 'Người chơi',
        },
        rating: rating?.rating ?? null,
      };
    });
  }
  async deleteComment(
    key: string,
    commentId: string,
    user: AuthenticatedUser,
    privateRoute = false,
  ) {
    await this.db.$transaction(async (tx) => {
      const game = privateRoute
        ? await tx.game.findUnique({ where: { id: key } })
        : await this.lockedGame(tx, key);
      if (!game) throw new NotFoundException('Game not found');
      const row = await tx.gameComment.findFirst({
        where: { id: commentId, gameId: game.id },
      });
      if (!row) throw new NotFoundException('Comment not found');
      if (
        row.userId !== user.id &&
        user.role !== 'ADMIN' &&
        user.role !== 'MODERATOR'
      )
        throw new ForbiddenException();
      await tx.gameComment.delete({ where: { id: row.id } });
    });
  }
  async privateComments(
    id: string,
    user: AuthenticatedUser,
    offset: number,
    limit: number,
  ) {
    const game = await this.db.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');
    if (game.ownerId !== user.id && !['ADMIN', 'MODERATOR'].includes(user.role))
      throw new ForbiddenException();
    return this.listComments(id, offset, limit);
  }
  async analytics(id: string, user: AuthenticatedUser): Promise<GameAnalytics> {
    const game = await this.db.game.findUnique({ where: { id } });
    owner(game, user);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 29);
    const [stats, days, first] = await Promise.all([
      this.stats(id),
      this.db.$queryRaw<
        { date: string; plays: bigint }[]
      >`SELECT to_char("createdAt", 'YYYY-MM-DD') AS date, COUNT(*) AS plays FROM "GamePlay" WHERE "gameId"=${id} AND "createdAt">=${start} GROUP BY date`,
      this.db.gamePlay.aggregate({
        where: { gameId: id },
        _min: { createdAt: true },
      }),
    ]);
    return {
      game: {
        id: game.id,
        title: game.title,
        slug: game.slug,
        reviewState: game.reviewState,
      },
      stats,
      dailyPlays: Array.from({ length: 30 }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const date = d.toISOString().slice(0, 10);
        return {
          date,
          plays: Number(days.find((day) => day.date === date)?.plays ?? 0),
        };
      }),
      trackingStartedAt: first._min.createdAt?.toISOString() ?? null,
    };
  }
  async settings(id: string, user: AuthenticatedUser, scoresEnabled: boolean) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id"=${id} FOR UPDATE`;
      const game = await tx.game.findUnique({ where: { id } });
      owner(game, user);
      return tx.game.update({
        where: { id },
        data: { scoresEnabled },
        select: { scoresEnabled: true },
      });
    });
  }
  async start(
    slug: string,
    user: AuthenticatedUser | undefined,
    guest: string,
    requestId: string,
  ): Promise<PlaySession> {
    return this.db.$transaction(async (tx) => {
      const game = await this.lockedGame(tx, slug);
      if (!game.artifactReady || game.artifactVersion < 1)
        throw new BadRequestException('Game is not playable');
      if (game.accessMode === 'AUTH_REQUIRED' && !user)
        throw new UnauthorizedException();
      const participantKey = digest(
        user ? `user:${user.id}` : `guest:${guest}`,
      );
      const now = new Date();
      const request = await tx.gamePlayRequest.findUnique({
        where: {
          gameId_participantKey_requestId: {
            gameId: game.id,
            participantKey,
            requestId,
          },
        },
        include: { play: true },
      });
      let play =
        request?.play ??
        (await tx.gamePlay.findFirst({
          where: {
            gameId: game.id,
            participantKey,
            createdAt: { gte: new Date(now.getTime() - 30000) },
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
        }));
      if (play && play.expiresAt <= now)
        throw new ConflictException('Play session expired; launch again');
      if (!play) {
        const id = randomUUID();
        play = await tx.gamePlay.create({
          data: {
            id,
            gameId: game.id,
            userId: user?.id,
            participantKey,
            tokenHash: hash(digest(`play:${id}`)),
            expiresAt: new Date(now.getTime() + 21600000),
            lastHeartbeatAt: now,
          },
        });
      }
      if (!request)
        await tx.gamePlayRequest.create({
          data: { gameId: game.id, participantKey, requestId, playId: play.id },
        });
      const personalBest = game.scoresEnabled
        ? await this.personalBest(tx, game.id, participantKey)
        : null;
      return {
        playId: play.id,
        token: digest(`play:${play.id}`),
        scoresEnabled: game.scoresEnabled,
        personalBest,
      };
    });
  }
  private async personalBest(tx: Tx, gameId: string, participantKey: string) {
    const best = await tx.gameScore.aggregate({
      where: { play: { gameId, participantKey } },
      _max: { score: true },
    });
    return best._max.score;
  }
  private async session(tx: Tx, slug: string, playId: string, token: string) {
    const game = await this.lockedGame(tx, slug);
    if (!game.artifactReady || game.artifactVersion < 1)
      throw new BadRequestException('Game is not playable');
    await tx.$queryRaw`SELECT "id" FROM "GamePlay" WHERE "id"=${playId} FOR UPDATE`;
    const play = await tx.gamePlay.findUnique({ where: { id: playId } });
    if (
      !play ||
      play.gameId !== game.id ||
      play.tokenHash !== hash(token) ||
      play.expiresAt <= new Date()
    )
      throw new UnauthorizedException();
    if (
      play.userId &&
      !(await tx.user.findFirst({
        where: { id: play.userId, isActive: true },
        select: { id: true },
      }))
    )
      throw new UnauthorizedException();
    if (game.accessMode === 'AUTH_REQUIRED' && !play.userId)
      throw new UnauthorizedException();
    return { game, play };
  }
  async heartbeat(
    slug: string,
    playId: string,
    input: { token: string; sequence: number; activeSeconds: number },
  ) {
    return this.db.$transaction(async (tx) => {
      const { play } = await this.session(tx, slug, playId, input.token);
      if (input.sequence <= play.sequence)
        return { activeSeconds: play.activeSeconds };
      const now = new Date();
      const delta = Math.min(
        input.activeSeconds,
        Math.max(
          0,
          Math.floor((now.getTime() - play.lastHeartbeatAt.getTime()) / 1000),
        ),
      );
      const updated = await tx.gamePlay.update({
        where: { id: play.id },
        data: {
          sequence: input.sequence,
          lastHeartbeatAt: now,
          activeSeconds: { increment: delta },
        },
        select: { activeSeconds: true },
      });
      return updated;
    });
  }
  async score(
    slug: string,
    playId: string,
    input: { token: string; score: number },
  ): Promise<GameScoreResult> {
    return this.db.$transaction(async (tx) => {
      const { game, play } = await this.session(tx, slug, playId, input.token);
      if (!game.scoresEnabled)
        throw new ForbiddenException('Scores are disabled');
      const previous = await tx.gameScore.findUnique({
        where: { playId: play.id },
      });
      const score = Math.max(input.score, previous?.score ?? 0);
      await tx.gameScore.upsert({
        where: { playId: play.id },
        create: { playId: play.id, score },
        update: { score },
      });
      const best = await tx.gameScore.aggregate({
        where: { play: { gameId: game.id } },
        _max: { score: true },
      });
      const personalBest = await this.personalBest(
        tx,
        game.id,
        play.participantKey,
      );
      return { highScore: best._max.score!, personalBest };
    });
  }
}
