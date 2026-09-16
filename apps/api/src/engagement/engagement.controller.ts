import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  engagementCommentsQuerySchema,
  engagementSettingsInputSchema,
  gameCommentInputSchema,
  gameRatingInputSchema,
  gameScoreInputSchema,
  playHeartbeatInputSchema,
  playStartInputSchema,
} from '@indieforge/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ACCESS_COOKIE, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EngagementService } from './engagement.service.js';
function parse<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Invalid engagement input');
  return result.data;
}
@Injectable()
export class OptionalEngagementAuthGuard implements CanActivate {
  constructor(@Inject(JwtAuthGuard) private readonly auth: JwtAuthGuard) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    return request.cookies?.[ACCESS_COOKIE] === undefined
      ? true
      : this.auth.canActivate(context);
  }
}
@Controller('engagement/games/:slug')
export class EngagementController {
  constructor(
    @Inject(EngagementService) private readonly engagement: EngagementService,
  ) {}
  @Get('stats') stats(@Param('slug') slug: string) {
    return this.engagement.publicStats(slug);
  }
  @Get('comments') comments(
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    const q = parse(engagementCommentsQuerySchema, query);
    return this.engagement.comments(slug, q.offset, q.limit);
  }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  viewer(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engagement.viewer(slug, user);
  }
  @Put('rating')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  rate(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.engagement.rate(
      slug,
      user,
      parse(gameRatingInputSchema, body).rating,
    );
  }
  @Delete('rating')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  unrate(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engagement.rate(slug, user, null);
  }
  @Post('comments')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  comment(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.engagement.comment(
      slug,
      user,
      parse(gameCommentInputSchema, body).body,
    );
  }
  @Delete('comments/:commentId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  deleteComment(
    @Param('slug') slug: string,
    @Param('commentId') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engagement.deleteComment(slug, id, user);
  }
  @Post('plays')
  @UseGuards(OptionalEngagementAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  start(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parse(playStartInputSchema, body);
    let guest: unknown = request.cookies?.tfg_guest;
    if (typeof guest !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(guest)) {
      guest = randomBytes(32).toString('base64url');
      response.cookie('tfg_guest', guest, {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.NODE_ENV === 'production' &&
          process.env.COOKIE_SECURE !== 'false',
        maxAge: 365 * 86400000,
        path: '/',
      });
    }
    return this.engagement.start(slug, user, guest as string, input.requestId);
  }
  @Patch('plays/:playId')
  @Header('Cache-Control', 'private, no-store')
  heartbeat(
    @Param('slug') slug: string,
    @Param('playId') playId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.heartbeat(
      slug,
      playId,
      parse(playHeartbeatInputSchema, body),
    );
  }
  @Post('plays/:playId/score')
  @Header('Cache-Control', 'private, no-store')
  score(
    @Param('slug') slug: string,
    @Param('playId') playId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.score(
      slug,
      playId,
      parse(gameScoreInputSchema, body),
    );
  }
}
@Controller('games/:id')
@UseGuards(JwtAuthGuard)
export class GameEngagementController {
  constructor(
    @Inject(EngagementService) private readonly engagement: EngagementService,
  ) {}
  @Header('Cache-Control', 'private, no-store') @Get('analytics') analytics(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engagement.analytics(id, user);
  }
  @Header('Cache-Control', 'private, no-store')
  @Patch('engagement-settings')
  settings(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.engagement.settings(
      id,
      user,
      parse(engagementSettingsInputSchema, body).scoresEnabled,
    );
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('community-comments')
  comments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    const q = parse(engagementCommentsQuerySchema, query);
    return this.engagement.privateComments(id, user, q.offset, q.limit);
  }
  @Header('Cache-Control', 'private, no-store')
  @Delete('community-comments/:commentId')
  @HttpCode(204)
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engagement.deleteComment(id, commentId, user, true);
  }
}
