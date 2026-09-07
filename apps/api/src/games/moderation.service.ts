import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  GamesRepository,
  moderationActionSummary,
  moderationGameSummary,
} from './games.service.js';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
  ) {}

  async pending() {
    return (await this.games.findPending()).map(moderationGameSummary);
  }

  async approve(gameId: string) {
    const game = await this.games.approve(gameId);
    if (!game) throw new ConflictException('Game is not pending review');
    return moderationActionSummary(game);
  }

  async reject(gameId: string, reviewNote: string) {
    const game = await this.games.reject(gameId, reviewNote.trim());
    if (!game) throw new ConflictException('Game is not pending review');
    return moderationActionSummary(game);
  }
}
