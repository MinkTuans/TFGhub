import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type {
  GameSummary,
  GameSourceType,
  GameReviewState,
  GameProjectInput,
  UpdateGameInput,
} from '@indieforge/contracts';

type CreateGameInput = {
  title: string;
  slug: string;
  description: string;
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  sourceType?: GameSourceType;
};

export type StoredGame = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  description: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  createdAt: Date;
  updatedAt: Date;
  sourceType: GameSourceType;
  reviewState: GameReviewState;
  projectData: GameSummary['projectData'];
  artifactVersion: number;
  reviewNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
};

export type WorkspaceUpdate = {
  projectData?: GameProjectInput;
  artifactVersion?: number;
  visibility: 'DRAFT';
  reviewState: 'DRAFT';
  reviewNote: null;
  submittedAt: null;
  reviewedAt: null;
};

export abstract class GamesRepository {
  abstract create(input: {
    ownerId: string;
    slug: string;
    title: string;
    description: string;
    accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
    visibility: 'DRAFT';
    moderationState: 'CLEAR';
    sourceType?: GameSourceType;
  }): Promise<StoredGame>;
  abstract findManyByOwner(ownerId: string): Promise<StoredGame[]>;
  abstract findUnique(id: string): Promise<StoredGame | null>;
  abstract findBySlug(slug: string): Promise<StoredGame | null>;
  abstract updateWorkspace(
    id: string,
    expectedUpdatedAt: Date,
    input: WorkspaceUpdate,
  ): Promise<StoredGame | null>;
  abstract update(id: string, input: UpdateGameInput): Promise<StoredGame>;
}

export function gameSummary(game: StoredGame): GameSummary {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    description: game.description,
    visibility: game.visibility,
    accessMode: game.accessMode,
    moderationState: game.moderationState,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    sourceType: game.sourceType,
    reviewState: game.reviewState,
    projectData: game.projectData,
    artifactVersion: game.artifactVersion,
    reviewNote: game.reviewNote,
    submittedAt: game.submittedAt?.toISOString() ?? null,
    reviewedAt: game.reviewedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
  ) {}

  async create(userId: string, input: CreateGameInput): Promise<GameSummary> {
    try {
      const game = await this.games.create({
        ownerId: userId,
        slug: input.slug,
        title: input.title,
        description: input.description,
        accessMode: input.accessMode,
        visibility: 'DRAFT',
        moderationState: 'CLEAR',
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      });
      return gameSummary(game);
    } catch (error) {
      const failure = error as {
        code?: unknown;
        meta?: { target?: unknown };
      } | null;
      if (
        failure?.code === 'P2002' &&
        Array.isArray(failure.meta?.target) &&
        failure.meta.target.includes('slug')
      ) {
        throw new ConflictException('Game slug already exists');
      }
      throw error;
    }
  }

  async listOwned(userId: string): Promise<GameSummary[]> {
    return (await this.games.findManyByOwner(userId)).map(gameSummary);
  }

  async updateOwned(
    gameId: string,
    userId: string,
    input: UpdateGameInput,
  ): Promise<GameSummary> {
    const game = await this.games.findUnique(gameId);
    if (!game || game.ownerId !== userId) {
      throw new ForbiddenException('You do not own this game');
    }
    return gameSummary(await this.games.update(gameId, input));
  }
}
