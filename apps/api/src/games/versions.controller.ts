import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CompleteGameVersionInput,
  CreateGameVersionInput,
  PublishGameInput,
} from '@indieforge/contracts';
import type { Request } from 'express';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { VersionsService } from './versions.service.js';

@Controller()
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Post('games/:gameId/versions')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const input = CreateGameVersionInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid version input');
    const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    return this.versions.createUpload(gameId, user.id, input.data, publicApiUrl);
  }

  @Post('games/:gameId/versions/:versionId/complete')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const input = CompleteGameVersionInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid completion input');
    return this.versions.complete(gameId, versionId, user.id, input.data.checksumSha256);
  }

  @Post('games/:gameId/publish')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const input = PublishGameInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid publish input');
    return this.versions.publish(gameId, user.id, input.data.versionId);
  }

  @Put('uploads/:token')
  @HttpCode(200)
  receive(@Param('token') token: string, @Req() request: Request) {
    const body = request.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Expected raw zip bytes');
    }
    return this.versions.receiveUpload(token, body);
  }
}
