import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { ReportsController } from './reports.controller.js';
import {
  ReportsRepository,
  ReportsService,
  type StoredReport,
} from './reports.service.js';

function mapReport(row: {
  id: string;
  gameId: string;
  reporterId: string;
  category: StoredReport['category'];
  evidence: string;
  status: StoredReport['status'];
  appealMessage: string;
  resolutionReason: string;
  createdAt: Date;
  game: StoredReport['game'];
}): StoredReport {
  return row;
}

const gameSelect = {
  id: true,
  slug: true,
  title: true,
  ownerId: true,
  visibility: true,
  moderationState: true,
  moderationReason: true,
} as const;

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    {
      provide: ReportsRepository,
      useFactory: (): ReportsRepository => ({
        findPublicGame: (slug) =>
          database.game.findFirst({
            where: { slug, visibility: 'PUBLIC' },
            select: gameSelect,
          }),
        findOpenByReporter: async (gameId, reporterId) => {
          const row = await database.report.findFirst({
            where: {
              gameId,
              reporterId,
              status: { in: ['OPEN', 'APPEALED'] },
            },
            include: { game: { select: gameSelect } },
          });
          return row ? mapReport(row) : null;
        },
        findById: async (id) => {
          const row = await database.report.findUnique({
            where: { id },
            include: { game: { select: gameSelect } },
          });
          return row ? mapReport(row) : null;
        },
        create: async (input) => {
          const row = await database.report.create({
            data: input,
            include: { game: { select: gameSelect } },
          });
          return mapReport(row);
        },
        saveReport: async (report) => {
          const row = await database.report.update({
            where: { id: report.id },
            data: {
              status: report.status,
              appealMessage: report.appealMessage,
              resolutionReason: report.resolutionReason,
            },
            include: { game: { select: gameSelect } },
          });
          return mapReport(row);
        },
        setGameModeration: async (gameId, state, reason) => {
          await database.game.update({
            where: { id: gameId },
            data: { moderationState: state, moderationReason: reason },
          });
        },
        listQueue: async () => {
          const rows = await database.report.findMany({
            where: { status: { in: ['OPEN', 'APPEALED'] } },
            orderBy: { createdAt: 'desc' },
            include: { game: { select: gameSelect } },
          });
          return rows.map(mapReport);
        },
        listForOwner: async (ownerId) => {
          const rows = await database.report.findMany({
            where: {
              game: { ownerId },
              status: { in: ['OPEN', 'APPEALED'] },
            },
            orderBy: { createdAt: 'desc' },
            include: { game: { select: gameSelect } },
          });
          return rows.map(mapReport);
        },
        countOpen: (gameId) =>
          database.report.count({
            where: { gameId, status: { in: ['OPEN', 'APPEALED'] } },
          }),
      }),
    },
  ],
})
export class ReportsModule {}
