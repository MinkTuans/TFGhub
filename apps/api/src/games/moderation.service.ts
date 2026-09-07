import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  GamesRepository,
  moderationActionSummary,
  moderationGameSummary,
} from './games.service.js';
import type { ReviewGameInput, ReviewRevisionInput } from '@indieforge/contracts';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
  ) {}

  async pending() {
    return (await this.games.findPending()).map(moderationGameSummary);
  }

  async approve(gameId: string, input: ReviewRevisionInput) {
    const game = await this.games.approve(gameId, {
      artifactVersion: input.artifactVersion,
      submittedAt: new Date(input.submittedAt),
    });
    if (!game) throw new ConflictException('Game is not pending review');
    return moderationActionSummary(game);
  }

  async reject(gameId: string, input: ReviewGameInput) {
    const game = await this.games.reject(
      gameId,
      { artifactVersion: input.artifactVersion, submittedAt: new Date(input.submittedAt) },
      input.reviewNote.trim(),
    );
    if (!game) throw new ConflictException('Game is not pending review');
    return moderationActionSummary(game);
  }
}
