import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { DevelopersModule } from './developers/developers.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { GamesModule } from './games/games.module.js';

@Module({
  imports: [AuthModule, DevelopersModule, GamesModule, DonationsModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
