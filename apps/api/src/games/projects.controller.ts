import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CreateGameProjectInput,
  UpdateGameProjectInput,
} from '@indieforge/contracts';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectsService } from './projects.service.js';

@Controller('games/:gameId/project')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const input = CreateGameProjectInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid engine project input');
    return this.projects.create(gameId, user.id, input.data);
  }

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('gameId') gameId: string) {
    return this.projects.get(gameId, user.id);
  }

  @Put()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const input = UpdateGameProjectInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid engine project input');
    return this.projects.update(gameId, user.id, input.data);
  }

  @Get('preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Param('gameId') gameId: string) {
    return this.projects.preview(gameId, user.id);
  }

  @Post('build')
  @HttpCode(201)
  build(@CurrentUser() user: AuthenticatedUser, @Param('gameId') gameId: string) {
    return this.projects.build(gameId, user.id);
  }
}
