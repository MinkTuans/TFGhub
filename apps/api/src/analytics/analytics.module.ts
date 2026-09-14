import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { AnalyticsController } from './analytics.controller.js';
import {
  AnalyticsRepository,
  AnalyticsService,
  type StoredSession,
} from './analytics.service.js';

function mapSession(row: {
  id: string;
  gameId: string;
  visitorId: string;
  valid: boolean;
  countedSeconds: number;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  game: { slug: string };
}): StoredSession {
  return { ...row, gameSlug: row.game.slug };
}

const sessionInclude = { game: { select: { slug: true } } } as const;

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    {
      provide: AnalyticsRepository,
      useFactory: (): AnalyticsRepository => ({
        findPublicGame: (slug) =>
          database.game.findFirst({
            where: { slug, visibility: 'PUBLIC', moderationState: 'CLEAR' },
            select: {
              id: true,
              slug: true,
              title: true,
              ownerId: true,
              visibility: true,
              moderationState: true,
              accessMode: true,
            },
          }),
        findRecentSession: async (gameId, visitorId, after) => {
          const row = await database.playSession.findFirst({
            where: { gameId, visitorId, createdAt: { gte: after } },
            orderBy: { createdAt: 'desc' },
            include: sessionInclude,
          });
          return row ? mapSession(row) : null;
        },
        findSession: async (id) => {
          const row = await database.playSession.findUnique({
            where: { id },
            include: sessionInclude,
          });
          return row ? mapSession(row) : null;
        },
        createSession: async (input) => {
          const row = await database.playSession.create({
            data: { gameId: input.gameId, visitorId: input.visitorId },
            include: sessionInclude,
          });
          return mapSession(row);
        },
        saveSession: async (session) => {
          const row = await database.playSession.update({
            where: { id: session.id },
            data: {
              valid: session.valid,
              countedSeconds: session.countedSeconds,
              lastHeartbeatAt: session.lastHeartbeatAt,
            },
            include: sessionInclude,
          });
          return mapSession(row);
        },
        findHeartbeat: async (eventId) =>
          database.playHeartbeat.findUnique({ where: { eventId } }),
        addHeartbeat: (input) =>
          database.playHeartbeat.create({
            data: {
              sessionId: input.sessionId,
              eventId: input.eventId,
              visible: input.visible,
              active: input.active,
              counted: input.counted,
              createdAt: input.createdAt,
            },
          }),
        countRecentHeartbeats: (sessionId, after) =>
          database.playHeartbeat.count({
            where: { sessionId, createdAt: { gte: after } },
          }),
        listOwnerGames: async (ownerId) => {
          const games = await database.game.findMany({
            where: { ownerId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              slug: true,
              title: true,
              playSessions: {
                where: { valid: true },
                select: { countedSeconds: true },
              },
            },
          });
          return games.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            validPlays: item.playSessions.length,
            countedSeconds: item.playSessions.reduce(
              (sum, session) => sum + session.countedSeconds,
              0,
            ),
          }));
        },
      }),
    },
  ],
})
export class AnalyticsModule {}
