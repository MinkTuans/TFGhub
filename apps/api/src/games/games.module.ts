import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GameArtifactsModule } from '../game-artifacts/game-artifacts.module.js';
import { GameContentService } from './game-content.service.js';
import {
  GameContentController,
  GameOwnerGuard,
  OptionalGameAuthGuard,
} from './game-content.controller.js';
import { GamesController } from './games.controller.js';
import { GamesRepository, GamesService } from './games.service.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { PublicGamesController } from './public-games.controller.js';
import {
  PublicGamesRepository,
  PublicGamesService,
} from './public-games.service.js';

export const gameSummarySelect = {
  id: true,
  ownerId: true,
  slug: true,
  title: true,
  description: true,
  visibility: true,
  accessMode: true,
  moderationState: true,
  createdAt: true,
  updatedAt: true,
  sourceType: true,
  reviewState: true,
  projectData: true,
  artifactVersion: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
} as const;

const publicGameSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  createdAt: true,
  owner: { select: { profile: { select: { displayName: true } } } },
} as const;

@Module({
  imports: [AuthModule, GameArtifactsModule],
  controllers: [
    GamesController,
    PublicGamesController,
    GameContentController,
    ModerationController,
  ],
  providers: [
    GamesService,
    ModerationService,
    PublicGamesService,
    GameContentService,
    GameOwnerGuard,
    OptionalGameAuthGuard,
    {
      provide: GamesRepository,
      useFactory: (): GamesRepository => ({
        create: (input) =>
          database.game.create({ data: input, select: gameSummarySelect }),
        findManyByOwner: (ownerId) =>
          database.game.findMany({
            where: { ownerId },
            orderBy: { createdAt: 'desc' },
            select: gameSummarySelect,
          }),
        findPending: () =>
          database.game.findMany({
            where: { reviewState: 'PENDING' },
            orderBy: { submittedAt: 'asc' },
            select: gameSummarySelect,
          }),
        findUnique: (id) =>
          database.game.findUnique({
            where: { id },
            select: gameSummarySelect,
          }),
        lockForArtifactReconciliation: (id) =>
          database.$transaction(async (tx) => {
            // The original finalization may still hold this row lock after its
            // client connection failed. Wait for commit/rollback before reading.
            await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${id} FOR UPDATE`;
            return tx.game.findUnique({
              where: { id },
              select: gameSummarySelect,
            });
          }),
        findBySlug: (slug) =>
          database.game.findUnique({
            where: { slug },
            select: gameSummarySelect,
          }),
        updateWorkspace: (id, expectedUpdatedAt, input) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, updatedAt: expectedUpdatedAt },
              data: input,
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
          }),
        submit: (id) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: {
                id,
                reviewState: { in: ['DRAFT', 'REJECTED'] },
                artifactVersion: { gt: 0 },
              },
              data: {
                reviewState: 'PENDING',
                visibility: 'DRAFT',
                reviewNote: null,
                submittedAt: new Date(),
                reviewedAt: null,
              },
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
          }),
        approve: (id) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, reviewState: 'PENDING' },
              data: {
                reviewState: 'APPROVED',
                visibility: 'PUBLIC',
                reviewNote: null,
                reviewedAt: new Date(),
              },
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
          }),
        reject: (id, reviewNote) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, reviewState: 'PENDING' },
              data: {
                reviewState: 'REJECTED',
                visibility: 'DRAFT',
                reviewNote,
                reviewedAt: new Date(),
              },
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
          }),
        update: (id, input) =>
          database.game.update({
            where: { id },
            data: input,
            select: gameSummarySelect,
          }),
      }),
    },
    {
      provide: PublicGamesRepository,
      useFactory: (): PublicGamesRepository => ({
        findMany: (query) =>
          database.game.findMany({
            where: query.where,
            orderBy: query.orderBy,
            take: query.take,
            ...(query.cursor ? { cursor: query.cursor, skip: query.skip } : {}),
            select: publicGameSelect,
          }),
        findBySlug: ({ where }) =>
          database.game.findFirst({ where, select: publicGameSelect }),
      }),
    },
  ],
  exports: [
    GamesService,
    GamesRepository,
    PublicGamesService,
    PublicGamesRepository,
    GameContentService,
  ],
})
export class GamesModule {}
