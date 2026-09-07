import {
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import {
  GameCoverService,
  MAX_COVER_BYTES,
  type CoverUpload,
} from './game-cover.service.js';
import type { StoredCover } from './cover-types.js';

@Injectable()
export class GameCoverOwnerGuard implements CanActivate {
  constructor(
    @Inject(GameCoverService) private readonly covers: GameCoverService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.covers.owned(String(request.params.id), request.user.id);
    return true;
  }
}

function coverVersion(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new NotFoundException('Cover not found');
  return Number(value);
}

function sendCover(response: Response, cover: StoredCover, isPublic: boolean) {
  response.set({
    'Content-Type': cover.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isPublic
      ? 'public, max-age=31536000, immutable'
      : 'private, no-store',
  });
  response.send(cover.content);
}

@Controller()
export class GameCoverController {
  constructor(
    @Inject(GameCoverService) private readonly covers: GameCoverService,
  ) {}

  @Post('games/:id/cover')
  @UseGuards(JwtAuthGuard, GameCoverOwnerGuard)
  @UseInterceptors(
    FileInterceptor('cover', {
      // Busboy emits its limit event when the threshold is reached, not exceeded.
      // The service enforces the inclusive 5 MiB limit on accepted buffers.
      limits: { fileSize: MAX_COVER_BYTES + 1, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: CoverUpload,
  ) {
    return this.covers.upload(id, user.id, file);
  }

  @Get('games/:id/cover/:version')
  @UseGuards(JwtAuthGuard)
  async owned(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('version') version: string,
    @Res() response: Response,
  ) {
    sendCover(
      response,
      await this.covers.readOwned(id, user.id, coverVersion(version)),
      false,
    );
  }

  @Get('covers/:slug/:version')
  async publicCover(
    @Param('slug') slug: string,
    @Param('version') version: string,
    @Res() response: Response,
  ) {
    sendCover(
      response,
      await this.covers.readPublic(slug, coverVersion(version)),
      true,
    );
  }
}
