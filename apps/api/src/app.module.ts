import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
