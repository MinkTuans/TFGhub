import { Module } from '@nestjs/common';
import { GameProjectDocument } from '@indieforge/contracts';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GamesController } from './games.controller.js';
import { GamesRepository, GamesService } from './games.service.js';
import {
  ProjectsRepository,
  ProjectsService,
  type StoredProject,
} from './projects.service.js';
import { ProjectsController } from './projects.controller.js';
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
import { ScanWorker } from './scan-worker.js';
import { VersionsController } from './versions.controller.js';
import { VersionsRepository } from './versions.repository.js';
import { VersionsService } from './versions.service.js';

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

function asStoredProject(row: {
  id: string;
  gameId: string;
  templateId: string;
  formatVersion: string;
  document: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StoredProject {
  return {
    ...row,
    document: GameProjectDocument.parse(row.document),
  };
}

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
    ProjectsController,
  ],
  providers: [
    GamesService,
    PublicGamesService,
    VersionsService,
    ProjectsService,
    ScanWorker,
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
      provide: ProjectsRepository,
      useFactory: (): ProjectsRepository => ({
        findGame: (id) =>
          database.game.findUnique({
            where: { id },
            select: { id: true, ownerId: true },
          }),
        findByGameId: async (gameId) => {
          const row = await database.gameProject.findUnique({ where: { gameId } });
          return row ? asStoredProject(row) : null;
        },
        create: async (input) =>
          asStoredProject(await database.gameProject.create({ data: input })),
        save: async (project) =>
          asStoredProject(
            await database.gameProject.update({
              where: { id: project.id },
              data: { document: project.document },
            }),
          ),
      }),
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
        listByGame: (gameId) =>
          database.gameVersion.findMany({
            where: { gameId },
            orderBy: { createdAt: 'desc' },
          }),
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
