import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { GameSummary } from '@indieforge/contracts';
import {
  GamesRepository,
  gameSummary,
  type StoredGame,
} from '../games/games.service.js';
import { CoverStorage, CoverVersionExistsError } from './cover-storage.js';
import type { CoverContentType, StoredCover } from './cover-types.js';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export type CoverUpload = { buffer: Buffer; mimetype: string };

function detectedType(bytes: Buffer): CoverContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    bytes.subarray(8, 12).equals(Buffer.from('WEBP'))
  )
    return 'image/webp';
  return null;
}

@Injectable()
export class GameCoverService {
  private readonly mutations = new Map<string, Promise<void>>();

  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
    @Inject(CoverStorage) private readonly storage: CoverStorage,
  ) {}

  async owned(gameId: string, userId: string): Promise<StoredGame> {
    const game = await this.games.findUnique(gameId);
    if (!game || game.ownerId !== userId)
      throw new ForbiddenException('You do not own this game');
    return game;
  }

  private async serialized<T>(
    gameId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutations.get(gameId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutations.set(gameId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.mutations.get(gameId) === current) this.mutations.delete(gameId);
    }
  }

  async upload(
    gameId: string,
    userId: string,
    file?: CoverUpload,
  ): Promise<GameSummary> {
    return this.serialized(gameId, async () => {
      const game = await this.owned(gameId, userId);
      if (!file)
        throw new BadRequestException('Provide one image in the cover field');
      if (file.buffer.length > MAX_COVER_BYTES)
        throw new PayloadTooLargeException('Cover exceeds 5 MiB');
      const contentType = detectedType(file.buffer);
      if (!contentType || contentType !== file.mimetype)
        throw new BadRequestException(
          'Cover must match its JPEG, PNG or WebP content type',
        );
      const coverVersion = game.coverVersion + 1;
      if (!Number.isSafeInteger(coverVersion))
        throw new ConflictException('Cover version limit reached');
      try {
        await this.storage.install(gameId, coverVersion, {
          content: file.buffer,
          contentType,
        });
      } catch (error) {
        // A different process may be finalizing this version. We only clean up
        // installations this request successfully created, never another writer's.
        if (error instanceof CoverVersionExistsError)
          throw new ConflictException(
            'Cover version already exists; reload the workspace',
          );
        throw new ServiceUnavailableException('Cover storage is unavailable');
      }
      try {
        const updated = await this.games.updateCover(
          gameId,
          userId,
          game.updatedAt,
          game.coverVersion,
          {
            coverVersion,
            coverContentType: contentType,
          },
        );
        if (!updated)
          throw new ConflictException('Game changed; reload the workspace');
        return gameSummary(updated);
      } catch (error) {
        let fresh: StoredGame | null;
        try {
          // Wait for an uncertain commit to finish before deciding whether its
          // installed bytes remain unreferenced. This locks the same Game row.
          fresh = await this.games.lockForArtifactReconciliation(gameId);
        } catch {
          throw new ServiceUnavailableException(
            'Cover finalization is unavailable',
          );
        }
        if (fresh?.coverVersion === coverVersion) return gameSummary(fresh);
        if (fresh && fresh.coverVersion + 1 === coverVersion) {
          try {
            await this.storage.discardUnreferenced(
              gameId,
              coverVersion,
              fresh.coverVersion,
            );
          } catch {
            throw new ServiceUnavailableException(
              'Cover storage is unavailable',
            );
          }
        }
        if (error instanceof ConflictException) throw error;
        throw new ServiceUnavailableException(
          'Cover finalization is unavailable',
        );
      }
    });
  }

  async readOwned(
    gameId: string,
    userId: string,
    version: number,
  ): Promise<StoredCover> {
    return this.read(await this.owned(gameId, userId), version);
  }

  async readPublic(slug: string, version: number): Promise<StoredCover> {
    const game = await this.games.findBySlug(slug);
    if (
      !game ||
      game.visibility !== 'PUBLIC' ||
      game.moderationState !== 'CLEAR' ||
      game.reviewState !== 'APPROVED'
    )
      throw new NotFoundException('Cover not found');
    return this.read(game, version);
  }

  private async read(game: StoredGame, version: number): Promise<StoredCover> {
    if (
      !Number.isSafeInteger(version) ||
      version <= 0 ||
      version !== game.coverVersion ||
      !game.coverContentType
    )
      throw new NotFoundException('Cover not found');
    try {
      const cover = await this.storage.read(game.id, version);
      if (cover.contentType !== game.coverContentType)
        throw new Error('Cover metadata mismatch');
      return cover;
    } catch {
      throw new NotFoundException('Cover not found');
    }
  }
}
