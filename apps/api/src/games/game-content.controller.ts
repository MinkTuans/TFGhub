import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  ACCESS_COOKIE,
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import type { StoredArtifactFile } from '../game-artifacts/artifact-types.js';
import {
  GameContentService,
  MAX_UPLOAD_BYTES,
} from './game-content.service.js';

@Injectable()
export class GameOwnerGuard implements CanActivate {
  constructor(
    @Inject(GameContentService) private readonly content: GameContentService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.content.owned(String(request.params.id), request.user.id);
    return true;
  }
}

@Injectable()
export class OptionalGameAuthGuard implements CanActivate {
  constructor(@Inject(JwtAuthGuard) private readonly auth: JwtAuthGuard) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    return request.cookies?.[ACCESS_COOKIE] === undefined
      ? true
      : this.auth.canActivate(context);
  }
}

function artifactPath(path?: string | string[]): string {
  return (Array.isArray(path) ? path.join('/') : path) || 'index.html';
}

function sendArtifact(
  response: Response,
  file: StoredArtifactFile,
  route: string,
) {
  const requestOrigin = new URL(
    `${response.req.protocol}://${response.req.get('host')}`,
  ).origin;
  const webOrigin = new URL(process.env.WEB_ORIGIN ?? requestOrigin).origin;
  // Direct API development and the production /api reverse proxy share the policy.
  const sources = [...new Set([requestOrigin, webOrigin])]
    .flatMap((origin) => [`${origin}${route}`, `${origin}/api${route}`])
    .join(' ');
  response.set({
    'Access-Control-Allow-Origin': '*',
    'Referrer-Policy': 'no-referrer',
    'Content-Type': file.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': [
      'sandbox allow-scripts allow-pointer-lock',
      "default-src 'none'",
      `script-src ${sources} 'unsafe-inline' 'unsafe-eval'`,
      `style-src ${sources} 'unsafe-inline'`,
      `img-src ${sources} data:`,
      `media-src ${sources}`,
      `font-src ${sources}`,
      "worker-src blob:",
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });
  response.removeHeader('Access-Control-Allow-Credentials');
  response.send(file.content);
}

function redirectCapability(response: Response, token: string, path: string) {
  // Relative Location preserves an outer /api proxy prefix without trusting a
  // forwarded-prefix header. The token remains in the path for relative assets.
  const requestedPath = response.req.originalUrl.split('?')[0]!;
  const levels = requestedPath.split('/').length - 2;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  response.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  response.redirect(
    302,
    `${'../'.repeat(levels)}game-content/${token}/${encodedPath}`,
  );
}

@Controller()
export class GameContentController {
  constructor(
    @Inject(GameContentService) private readonly content: GameContentService,
  ) {}

  @Get('games/:id')
  @UseGuards(JwtAuthGuard)
  workspace(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.workspace(id, user.id);
  }

  @Put('games/:id/project')
  @UseGuards(JwtAuthGuard)
  saveProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.content.saveProject(id, user.id, body);
  }

  @Post('games/:id/build')
  @UseGuards(JwtAuthGuard)
  build(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.build(id, user.id);
  }

  @Post('games/:id/upload')
  @UseGuards(JwtAuthGuard, GameOwnerGuard)
  @UseInterceptors(
    FileInterceptor('game', {
      // Busboy emits partsLimit when the count reaches the limit (including one valid part).
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: { originalname: string; buffer: Buffer },
  ) {
    if (!file || !file.originalname.toLowerCase().endsWith('.zip'))
      throw new BadRequestException('Provide one .zip file in the game field');
    return this.content.upload(id, user.id, file.buffer);
  }

  @Get('games/:id/preview/{*path}')
  @UseGuards(JwtAuthGuard)
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('path') path: string[] | undefined,
    @Res() response: Response,
  ) {
    const capability = await this.content.previewCapability(id, user);
    redirectCapability(response, capability.token, artifactPath(path));
  }

  @Get('play/:slug/{*path}')
  @UseGuards(OptionalGameAuthGuard)
  async play(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('slug') slug: string,
    @Param('path') path: string[] | undefined,
    @Res() response: Response,
  ) {
    const capability = await this.content.playCapability(slug, user);
    redirectCapability(response, capability.token, artifactPath(path));
  }

  @Get('game-content/:token/{*path}')
  async capability(
    @Param('token') token: string,
    @Param('path') path: string[] | undefined,
    @Res() response: Response,
  ) {
    sendArtifact(
      response,
      await this.content.capabilityFile(token, artifactPath(path)),
      `/game-content/${encodeURIComponent(token)}/`,
    );
  }
}
