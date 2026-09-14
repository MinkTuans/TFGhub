import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  PlayHeartbeatInput,
  StartPlaySessionInput,
} from '@indieforge/contracts';
import { AuthService, type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ACCESS_COOKIE, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service.js';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly tokens: JwtService,
    private readonly auth: AuthService,
  ) {}

  private async optionalUserId(request: Request): Promise<string | null> {
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) return null;
    try {
      const payload = await this.tokens.verifyAsync(token);
      if (typeof payload.sub !== 'string' || !payload.sub) return null;
      const user = await this.auth.findUser(payload.sub);
      return user?.id ?? null;
    } catch {
      return null;
    }
  }

  @Post('analytics/sessions')
  @HttpCode(201)
  async start(@Req() request: Request, @Body() body: unknown) {
    const input = StartPlaySessionInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid play session');
    return this.analytics.startSession(input.data, await this.optionalUserId(request));
  }

  @Post('analytics/sessions/:id/heartbeats')
  @HttpCode(201)
  heartbeat(@Param('id') sessionId: string, @Body() body: unknown) {
    const input = PlayHeartbeatInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid heartbeat');
    return this.analytics.heartbeat(sessionId, input.data);
  }

  @Get('analytics/studio')
  @UseGuards(JwtAuthGuard)
  studio(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.studio(user.id);
  }
}
