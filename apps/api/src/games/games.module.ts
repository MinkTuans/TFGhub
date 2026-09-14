import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GamesController } from './games.controller.js';
import { GamesRepository, GamesService } from './games.service.js';
import {
  createObjectStorage,
  createR2ObjectStorage,
  ObjectStorage,
} from './object-storage.js';
import { PublicGamesController } from './public-games.controller.js';
import {
  PublicGamesRepository,
  PublicGamesService,
} from './public-games.service.js';
import { RuntimeController } from './runtime.controller.js';
import { RuntimeService } from './runtime.service.js';
import { VersionsController } from './versions.controller.js';
import { VersionsRepository, VersionsService } from './versions.service.js';

export const gameSummarySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  visibility: true,
  accessMode: true,
  moderationState: true,
  createdAt: true,
  updatedAt: true,
} as const;

const publicGameSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  createdAt: true,
  activeVersionId: true,
  owner: { select: { profile: { select: { displayName: true } } } },
} as const;

@Module({
  imports: [AuthModule],
  controllers: [
    GamesController,
    PublicGamesController,
    VersionsController,
    RuntimeController,
  ],
  providers: [
    GamesService,
    PublicGamesService,
    VersionsService,
    RuntimeService,
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
        findUnique: (id) =>
          database.game.findUnique({
            where: { id },
            select: { id: true, ownerId: true },
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
            ...(query.cursor
              ? { cursor: query.cursor, skip: query.skip }
              : {}),
            select: publicGameSelect,
          }),
        findBySlug: ({ where }) =>
          database.game.findFirst({ where, select: publicGameSelect }),
      }),
    },
    {
      provide: ObjectStorage,
      useFactory: async () =>
        (await createR2ObjectStorage()) ?? createObjectStorage(),
    },
    {
      provide: VersionsRepository,
      useFactory: (): VersionsRepository => ({
        create: (input) =>
          database.gameVersion.create({
            data: {
              ...input,
              status: 'UPLOADING',
            },
          }),
        findById: (id) => database.gameVersion.findUnique({ where: { id } }),
        findByUploadToken: (uploadToken) =>
          database.gameVersion.findUnique({ where: { uploadToken } }),
        save: (version) =>
          database.gameVersion.update({
            where: { id: version.id },
            data: {
              status: version.status,
              findings: version.findings,
              uploadToken: version.uploadToken,
              uploadExpiresAt: version.uploadExpiresAt,
            },
          }),
        findGame: (id) =>
          database.game.findUnique({
            where: { id },
            select: {
              id: true,
              ownerId: true,
              visibility: true,
              moderationState: true,
              activeVersionId: true,
            },
          }),
        publish: async (gameId, versionId) => {
          const game = await database.game.update({
            where: { id: gameId },
            data: { visibility: 'PUBLIC', activeVersionId: versionId },
            select: gameSummarySelect,
          });
          return {
            ...game,
            createdAt: game.createdAt.toISOString(),
            updatedAt: game.updatedAt.toISOString(),
          };
        },
        findPublishedRuntime: async (slug) => {
          const game = await database.game.findFirst({
            where: {
              slug,
              visibility: 'PUBLIC',
              moderationState: 'CLEAR',
              activeVersion: { is: { status: 'READY' } },
            },
            select: { activeVersion: { select: { storageKey: true } } },
          });
          return game?.activeVersion ?? null;
        },
      }),
    },
  ],
  exports: [
    GamesService,
    GamesRepository,
    PublicGamesService,
    PublicGamesRepository,
    VersionsService,
  ],
})
export class GamesModule {}
