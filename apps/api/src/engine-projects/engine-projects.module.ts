import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EngineProjectsController } from './engine-projects.controller.js';
import {
  EngineProjectsRepository,
  PrismaEngineProjectsRepository,
} from './engine-projects.repository.js';
import { EngineProjectsService } from './engine-projects.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EngineProjectsController],
  providers: [
    EngineProjectsService,
    {
      provide: EngineProjectsRepository,
      useFactory: () => new PrismaEngineProjectsRepository(),
    },
  ],
  exports: [EngineProjectsService, EngineProjectsRepository],
})
export class EngineProjectsModule {}
