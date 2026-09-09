import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateEngineGameInput,
  CreateGameInput,
  UpdateGameInput,
} from '@indieforge/contracts';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GamesService } from './games.service.js';

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post('engine-projects')
  createEngineProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const input = CreateEngineGameInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid game input');
    return this.games.createEngineProject(user.id, input.data);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateGameInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid game input');
    return this.games.create(user.id, input.data);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.games.listOwned(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') gameId: string,
    @Body() body: unknown,
  ) {
    const input = UpdateGameInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid game input');
    return this.games.updateOwned(gameId, user.id, input.data);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') gameId: string) {
    return this.games.submitOwned(gameId, user.id);
  }
}
