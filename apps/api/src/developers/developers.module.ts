import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { DevelopersController } from './developers.controller.js';
import {
  DeveloperProfilesRepository,
  DevelopersService,
} from './developers.service.js';

const developerProfileSelect = {
  displayName: true,
  bio: true,
} as const;

@Module({
  imports: [AuthModule],
  controllers: [DevelopersController],
  providers: [
    DevelopersService,
    {
      provide: DeveloperProfilesRepository,
      useFactory: (): DeveloperProfilesRepository => ({
        findByUserId: (userId) =>
          database.developerProfile.findUnique({
            where: { userId },
            select: developerProfileSelect,
          }),
        upsert: (userId, input) =>
          database.developerProfile.upsert({
            where: { userId },
            create: { userId, ...input },
            update: input,
            select: developerProfileSelect,
          }),
      }),
    },
  ],
  exports: [DevelopersService, DeveloperProfilesRepository],
})
export class DevelopersModule {}
