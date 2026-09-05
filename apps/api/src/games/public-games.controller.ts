import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { DiscoverGamesInput } from '@indieforge/contracts';
import { PublicGamesService } from './public-games.service.js';

@Controller()
export class PublicGamesController {
  constructor(private readonly games: PublicGamesService) {}

  @Get('discover')
  discover(@Query() query: unknown) {
    const input = DiscoverGamesInput.safeParse(query);
    if (!input.success) throw new BadRequestException('Invalid discovery query');
    return this.games.discover(input.data);
  }

  @Get('games/by-slug/:slug')
  async bySlug(@Param('slug') slug: string) {
    const game = await this.games.findBySlug(slug);
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }
}
