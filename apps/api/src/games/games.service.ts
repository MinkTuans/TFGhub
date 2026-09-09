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
  CreateEngineGameInput,
  CreateEngineGameResponse,
} from '@indieforge/contracts';
import { EngineProjectV2 } from '@indieforge/engine-core';
import { createHash, randomUUID } from 'node:crypto';
import type { StoredEngineRevision } from '../engine-projects/engine-projects.repository.js';

type CreateGameInput = {
  title: string;
  slug: string;
  description: string;
  accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
  sourceType?: GameSourceType;
  viewportWidth: number;
  viewportHeight: number;
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
  artifactReady: boolean;
  coverVersion: number;
  coverContentType: string | null;
  viewportWidth: number;
  viewportHeight: number;
  reviewNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
};

export type WorkspaceUpdate = {
  projectData?: GameProjectInput;
  artifactVersion?: number;
  artifactReady?: boolean;
  visibility: 'DRAFT';
  reviewState: 'DRAFT';
  reviewNote: null;
  submittedAt: null;
  reviewedAt: null;
};

export type MetadataUpdate = UpdateGameInput &
  Partial<
    Pick<
      WorkspaceUpdate,
      'visibility' | 'reviewState' | 'reviewNote' | 'submittedAt' | 'reviewedAt'
    >
  >;

export type ModerationCreator = {
  id: string;
  displayName: string | null;
};

export type ModerationStoredGame = Omit<
  StoredGame,
  'ownerId' | 'projectData'
> & {
  creator: ModerationCreator;
};

export type ModerationGameSummary = Omit<GameSummary, 'projectData'> & {
  creator: ModerationCreator;
};

export type ModerationActionSummary = Omit<GameSummary, 'projectData'>;
export type SubmittedRevision = { artifactVersion: number; submittedAt: Date };

export abstract class GamesRepository {
  abstract createEngineProject(input: {
    ownerId: string;
    slug: string;
    title: string;
    document: EngineProjectV2;
    contentHash: string;
    byteSize: number;
  }): Promise<{ game: StoredGame; revision: StoredEngineRevision }>;
  abstract updateCover(
    id: string,
    ownerId: string,
    expectedUpdatedAt: Date,
    expectedCoverVersion: number,
    input: {
      coverVersion: number;
      coverContentType: 'image/jpeg' | 'image/png' | 'image/webp';
    },
  ): Promise<StoredGame | null>;
  abstract create(input: {
    ownerId: string;
    slug: string;
    title: string;
    description: string;
    accessMode: 'GUEST_ALLOWED' | 'AUTH_REQUIRED';
    visibility: 'DRAFT';
    moderationState: 'CLEAR';
    sourceType?: GameSourceType;
    viewportWidth: number;
    viewportHeight: number;
  }): Promise<StoredGame>;
  abstract findManyByOwner(ownerId: string): Promise<StoredGame[]>;
  abstract findPending(): Promise<ModerationStoredGame[]>;
  abstract findUnique(id: string): Promise<StoredGame | null>;
  /** Wait for in-flight row writers before returning artifact reconciliation state. */
  abstract lockForArtifactReconciliation(
    id: string,
  ): Promise<StoredGame | null>;
  abstract findBySlug(slug: string): Promise<StoredGame | null>;
  abstract updateWorkspace(
    id: string,
    expectedUpdatedAt: Date,
    input: WorkspaceUpdate,
  ): Promise<StoredGame | null>;
  abstract submit(id: string): Promise<StoredGame | null>;
  abstract approve(id: string, revision: SubmittedRevision): Promise<StoredGame | null>;
  abstract reject(id: string, revision: SubmittedRevision, reviewNote: string): Promise<StoredGame | null>;
  abstract updateOwned(
    id: string,
    ownerId: string,
    expectedUpdatedAt: Date,
    input: MetadataUpdate,
  ): Promise<StoredGame | null>;
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
    artifactReady: game.artifactReady,
    coverVersion: game.coverVersion,
    coverContentType: game.coverContentType as GameSummary['coverContentType'],
    viewportWidth: game.viewportWidth,
    viewportHeight: game.viewportHeight,
    reviewNote: game.reviewNote,
    submittedAt: game.submittedAt?.toISOString() ?? null,
    reviewedAt: game.reviewedAt?.toISOString() ?? null,
  };
}

export function moderationActionSummary(
  game: Omit<StoredGame, 'ownerId' | 'projectData'>,
): ModerationActionSummary {
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
    artifactVersion: game.artifactVersion,
    artifactReady: game.artifactReady,
    coverVersion: game.coverVersion,
    coverContentType: game.coverContentType as GameSummary['coverContentType'],
    viewportWidth: game.viewportWidth,
    viewportHeight: game.viewportHeight,
    reviewNote: game.reviewNote,
    submittedAt: game.submittedAt?.toISOString() ?? null,
    reviewedAt: game.reviewedAt?.toISOString() ?? null,
  };
}

export function moderationGameSummary(
  game: ModerationStoredGame,
): ModerationGameSummary {
  return {
    ...moderationActionSummary(game),
    creator: game.creator,
  };
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
  ) {}

  async createEngineProject(
    userId: string,
    input: CreateEngineGameInput,
  ): Promise<CreateEngineGameResponse> {
    const sceneId = randomUUID();
    const document = canonicalize(
      EngineProjectV2.parse({
        schemaVersion: 2,
        projectId: randomUUID(),
        engineFamily: 'TFG_ENGINE',
        entrySceneId: sceneId,
        settings: { viewport: { width: 1280, height: 720 }, pixelArt: false },
        assetIds: [],
        scenes: [
          {
            id: sceneId,
            name: 'Cảnh 1',
            key: 'scene-1',
            order: 0,
            type: 'MIXED',
            width: 1280,
            height: 720,
            background: { color: '#102040', assetId: null },
            settings: {
              gravityX: 0,
              gravityY: 0,
              grid: { enabled: true, size: 32, snap: true },
            },
            layers: [
              {
                id: randomUUID(),
                name: 'World',
                order: 0,
                type: 'WORLD',
                visible: true,
                locked: false,
              },
            ],
            objects: [],
          },
        ],
        variables: { global: [], player: [], scene: {} },
        prefabs: [],
        events: [],
        modules: [],
        scripts: [],
      }),
    ) as EngineProjectV2;
    const serialized = JSON.stringify(document);
    const snapshot = {
      document,
      contentHash: createHash('sha256').update(serialized).digest('hex'),
      byteSize: Buffer.byteLength(serialized),
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { game, revision } = await this.games.createEngineProject({
          ownerId: userId,
          title: input.title,
          slug: `game-chua-co-ten-${randomUUID()}`,
          ...snapshot,
        });
        return {
          game: gameSummary(game),
          project: {
            status: 'SUPPORTED',
            project: EngineProjectV2.parse(revision.document),
            revision: {
              revisionNumber: revision.revisionNumber,
              schemaVersion: revision.schemaVersion,
              contentHash: revision.contentHash,
              byteSize: revision.byteSize,
              retention: revision.retention,
              createdAt: revision.createdAt.toISOString(),
            },
          },
        };
      } catch (error) {
        const failure = error as {
          code?: unknown;
          meta?: { target?: unknown };
        } | null;
        if (
          failure?.code !== 'P2002' ||
          !Array.isArray(failure.meta?.target) ||
          !failure.meta.target.includes('slug')
        )
          throw error;
        // A unique collision aborts the entire transaction; retry in a fresh one.
      }
    }
    throw new ConflictException('Could not allocate a game slug; try again');
  }

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
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
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
    const resetReview =
      game.reviewState === 'PENDING' || game.reviewState === 'APPROVED'
        ? {
            visibility: 'DRAFT' as const,
            reviewState: 'DRAFT' as const,
            reviewNote: null,
            submittedAt: null,
            reviewedAt: null,
          }
        : {};
    const updated = await this.games.updateOwned(
      gameId,
      userId,
      game.updatedAt,
      { ...input, ...resetReview },
    );
    if (!updated)
      throw new ConflictException('Game changed; reload the workspace');
    return gameSummary(updated);
  }

  async submitOwned(gameId: string, userId: string): Promise<GameSummary> {
    const game = await this.games.findUnique(gameId);
    if (!game || game.ownerId !== userId) {
      throw new ForbiddenException('You do not own this game');
    }
    if (game.artifactVersion < 1 || !game.artifactReady) {
      throw new ConflictException(
        'Build or upload a game artifact before review',
      );
    }
    const submitted = await this.games.submit(gameId);
    if (!submitted) throw new ConflictException('Game cannot be submitted');
    return gameSummary(submitted);
  }
}

// Match canonical revision hashing used by the engine project save repository.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
