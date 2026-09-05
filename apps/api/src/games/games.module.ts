import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GamesController } from './games.controller.js';
import { GamesRepository, GamesService } from './games.service.js';
import { PublicGamesController } from './public-games.controller.js';
import {
  PublicGamesRepository,
  PublicGamesService,
} from './public-games.service.js';

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
  owner: { select: { profile: { select: { displayName: true } } } },
} as const;

@Module({
  imports: [AuthModule],
  controllers: [GamesController, PublicGamesController],
  providers: [
    GamesService,
    PublicGamesService,
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
  ],
  exports: [
    GamesService,
    GamesRepository,
    PublicGamesService,
    PublicGamesRepository,
  ],
})
export class GamesModule {}
