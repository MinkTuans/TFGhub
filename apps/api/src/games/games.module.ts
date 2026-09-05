import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { GamesController } from './games.controller.js';
import { GamesRepository, GamesService } from './games.service.js';

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

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [
    GamesService,
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
  ],
  exports: [GamesService, GamesRepository],
})
export class GamesModule {}
