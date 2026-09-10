import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { DevelopersModule } from './developers/developers.module.js';
import { GamesModule } from './games/games.module.js';
import { EngineProjectsModule } from './engine-projects/engine-projects.module.js';
import { GameAssetsModule } from './game-assets/game-assets.module.js';

@Module({
  imports: [
    AuthModule,
    DevelopersModule,
    GamesModule,
    EngineProjectsModule,
    GameAssetsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
