import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import {
  EngagementController,
  GameEngagementController,
  OptionalEngagementAuthGuard,
} from './engagement.controller.js';
import {
  ENGAGEMENT_DATABASE,
  EngagementService,
} from './engagement.service.js';
@Module({
  imports: [AuthModule],
  controllers: [EngagementController, GameEngagementController],
  providers: [
    EngagementService,
    OptionalEngagementAuthGuard,
    { provide: ENGAGEMENT_DATABASE, useValue: database },
  ],
})
export class EngagementModule {}
