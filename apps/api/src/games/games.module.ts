import { EngineProjectsModule } from '../engine-projects/engine-projects.module.js';
import { GameAssetsModule } from '../game-assets/game-assets.module.js';
import {
  EngineBuildService,
  EngineBuildRecords,
} from './engine-build.service.js';
import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GameArtifactsModule } from '../game-artifacts/game-artifacts.module.js';
import { GameCoversModule } from '../game-covers/game-covers.module.js';
import {
  GameCoverController,
  GameCoverOwnerGuard,
} from '../game-covers/game-cover.controller.js';
import { GameCoverService } from '../game-covers/game-cover.service.js';
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
  artifactReady: true,
  coverVersion: true,
  coverContentType: true,
  viewportWidth: true,
  viewportHeight: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
} as const;

const moderationGameSelect = {
  id: true,
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
  artifactVersion: true,
  artifactReady: true,
  coverVersion: true,
  coverContentType: true,
  viewportWidth: true,
  viewportHeight: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  owner: {
    select: {
      id: true,
      profile: { select: { displayName: true } },
    },
  },
} as const;

const publicGameSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  createdAt: true,
  artifactVersion: true,
  artifactReady: true,
  coverVersion: true,
  coverContentType: true,
  viewportWidth: true,
  viewportHeight: true,
  owner: { select: { profile: { select: { displayName: true } } } },
} as const;

@Module({
  imports: [
    AuthModule,
    GameArtifactsModule,
    GameCoversModule,
    EngineProjectsModule,
    GameAssetsModule,
  ],
  controllers: [
    GamesController,
    PublicGamesController,
    GameContentController,
    GameCoverController,
    ModerationController,
  ],
  providers: [
    EngineBuildService,
    EngineBuildRecords,
    GamesService,
    GameCoverService,
    GameCoverOwnerGuard,
    ModerationService,
    PublicGamesService,
    GameContentService,
    GameOwnerGuard,
    OptionalGameAuthGuard,
    {
      provide: GamesRepository,
      useFactory: (): GamesRepository => ({
        createEngineProject: (input) =>
          database.$transaction(async (tx) => {
            const game = await tx.game.create({
              data: {
                ownerId: input.ownerId,
                slug: input.slug,
                title: input.title,
                sourceType: 'ENGINE',
                visibility: 'DRAFT',
                reviewState: 'DRAFT',
                moderationState: 'CLEAR',
                viewportWidth: input.document.settings.viewport.width,
                viewportHeight: input.document.settings.viewport.height,
              },
              select: gameSummarySelect,
            });
            const project = await tx.engineProject.create({
              data: {
                id: input.document.projectId,
                gameId: game.id,
                headRevisionNumber: 0,
                revisions: {
                  create: {
                    revisionNumber: 0,
                    schemaVersion: 2,
                    document: input.document as never,
                    contentHash: input.contentHash,
                    byteSize: BigInt(input.byteSize),
                    retention: 'PINNED',
                    authorId: input.ownerId,
                  },
                },
              },
              include: { revisions: true },
            });
            const revision = project.revisions[0]!;
            return {
              game,
              revision: { ...revision, byteSize: Number(revision.byteSize) },
            };
          }),
        updateCover: (
          id,
          ownerId,
          expectedUpdatedAt,
          expectedCoverVersion,
          input,
        ) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: {
                id,
                ownerId,
                updatedAt: expectedUpdatedAt,
                coverVersion: expectedCoverVersion,
              },
              data: input,
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
          }),
        create: (input) =>
          database.game.create({ data: input, select: gameSummarySelect }),
        findManyByOwner: (ownerId) =>
          database.game.findMany({
            where: { ownerId },
            orderBy: { createdAt: 'desc' },
            select: gameSummarySelect,
          }),
        findPending: async () =>
          (
            await database.game.findMany({
              where: { reviewState: 'PENDING' },
              orderBy: { submittedAt: 'asc' },
              select: moderationGameSelect,
            })
          ).map(({ owner, ...game }) => ({
            ...game,
            creator: {
              id: owner.id,
              displayName: owner.profile?.displayName ?? null,
            },
          })),
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
            const { engineBuild, ...data } = input;
            // Lock before checking the head: saves take the same game lock first.
            await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${id} FOR UPDATE`;
            const result = await tx.game.updateMany({
              where: {
                id,
                updatedAt: expectedUpdatedAt,
                ...(engineBuild
                  ? {
                      engineProject: {
                        headRevisionNumber: engineBuild.revisionNumber,
                      },
                    }
                  : {}),
              },
              data,
            });
            if (result.count !== 1) return null;
            if (engineBuild) {
              const completed = await tx.gameBuild.updateMany({
                where: { id: engineBuild.id, gameId: id, state: 'BUILDING' },
                data: {
                  state: 'READY',
                  completedAt: new Date(),
                  contentHash: engineBuild.contentHash,
                  manifest: {
                    artifactVersion: input.artifactVersion!,
                    entry: 'index.html',
                  },
                },
              });
              if (completed.count !== 1)
                throw new Error('Build provenance changed');
            }
            return tx.game.findUnique({
              where: { id },
              select: gameSummarySelect,
            });
          }),
        submit: (id) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: {
                id,
                reviewState: { in: ['DRAFT', 'REJECTED'] },
                artifactVersion: { gt: 0 },
                artifactReady: true,
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
        approve: (id, revision) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, reviewState: 'PENDING', ...revision },
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
        reject: (id, revision, reviewNote) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, reviewState: 'PENDING', ...revision },
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
        updateOwned: (id, ownerId, expectedUpdatedAt, input) =>
          database.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
              where: { id, ownerId, updatedAt: expectedUpdatedAt },
              data: input,
            });
            return result.count === 1
              ? tx.game.findUnique({ where: { id }, select: gameSummarySelect })
              : null;
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
