import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SaveEngineProjectInput } from '@indieforge/contracts';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EngineProjectsService } from './engine-projects.service.js';

@Controller('games/:id/engine-project')
@UseGuards(JwtAuthGuard)
export class EngineProjectsController {
  constructor(private readonly projects: EngineProjectsService) {}

  @Get()
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') gameId: string) {
    return this.projects.read(gameId, user.id);
  }

  @Post('materialize')
  materialize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') gameId: string,
  ) {
    return this.projects.materialize(gameId, user.id);
  }

  @Put()
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') gameId: string,
    @Body() body: unknown,
  ) {
    const input = SaveEngineProjectInput.safeParse(body);
    if (!input.success)
      throw new BadRequestException('Invalid engine project input');
    return this.projects.save(gameId, user.id, input.data);
  }
}
