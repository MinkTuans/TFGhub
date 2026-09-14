import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  CreateGameVersionInput,
  GameSummary,
  GameVersionSummary,
} from '@indieforge/contracts';
import { ObjectStorage } from './object-storage.js';
import { ScanWorker } from './scan-worker.js';
import {
  VersionsRepository,
  type OwnedGame,
  type StoredVersion,
} from './versions.repository.js';

export {
  VersionsRepository,
  type OwnedGame,
  type StoredVersion,
} from './versions.repository.js';

function summary(version: StoredVersion): GameVersionSummary {
  return {
    id: version.id,
    gameId: version.gameId,
    status: version.status,
    filename: version.filename,
    byteSize: version.byteSize,
    checksumSha256: version.checksumSha256,
    findings: version.findings,
    createdAt: version.createdAt.toISOString(),
  };
}

@Injectable()
export class VersionsService {
  constructor(
    @Inject(VersionsRepository)
    private readonly versions: VersionsRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(ScanWorker) private readonly scanner: ScanWorker,
  ) {}

  private async requireOwnedGame(gameId: string, userId: string): Promise<OwnedGame> {
    const game = await this.versions.findGame(gameId);
    if (!game || game.ownerId !== userId) {
      throw new ForbiddenException('You do not own this game');
    }
    return game;
  }

  async createUpload(
    gameId: string,
    userId: string,
    input: CreateGameVersionInput,
    publicApiUrl: string,
  ) {
    await this.requireOwnedGame(gameId, userId);
    const id = randomBytes(8).toString('hex');
    const token = randomBytes(24).toString('hex');
    const version = await this.versions.create({
      gameId,
      filename: input.filename,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      storageKey: `quarantine/${gameId}/${id}/${input.filename}`,
      uploadToken: token,
      uploadExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const origin = publicApiUrl.replace(/\/$/, '');
    const presigned = await this.storage.presignPut?.(version.storageKey, 900);
    return {
      ...summary(version),
      uploadUrl: presigned ?? `${origin}/uploads/${token}`,
    };
  }

  async receiveUpload(token: string, body: Buffer): Promise<void> {
    const version = await this.versions.findByUploadToken(token);
    if (
      !version ||
      version.status !== 'UPLOADING' ||
      !version.uploadExpiresAt ||
      version.uploadExpiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('Upload slot not found');
    }
    if (body.length !== version.byteSize) {
      throw new BadRequestException('Upload size does not match the declared byte size');
    }
    await this.storage.put(version.storageKey, body);
  }

  async complete(gameId: string, versionId: string, userId: string, checksumSha256: string) {
    await this.requireOwnedGame(gameId, userId);
    const version = await this.versions.findById(versionId);
    if (!version || version.gameId !== gameId) {
      throw new NotFoundException('Version not found');
    }
    if (version.status !== 'UPLOADING') {
      throw new ConflictException('Version is not awaiting completion');
    }
    const body = await this.storage.get(version.storageKey);
    if (!body) {
      throw new BadRequestException('Upload is missing');
    }
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== checksumSha256 || actual !== version.checksumSha256) {
      throw new BadRequestException('Checksum does not match the uploaded archive');
    }
    version.status = 'SCANNING';
    version.uploadToken = null;
    await this.versions.save(version);
    return summary(await this.scanner.process(version.id));
  }

  async listOwned(gameId: string, userId: string): Promise<GameVersionSummary[]> {
    await this.requireOwnedGame(gameId, userId);
    return (await this.versions.listByGame(gameId)).map(summary);
  }

  async rollback(
    gameId: string,
    userId: string,
    versionId: string,
  ): Promise<GameSummary> {
    const game = await this.requireOwnedGame(gameId, userId);
    if (game.visibility !== 'PUBLIC' || !game.activeVersionId) {
      throw new ConflictException('Nothing to roll back');
    }
    if (game.activeVersionId === versionId) {
      throw new ConflictException('That version is already live');
    }
    return this.publish(gameId, userId, versionId);
  }

  async publish(gameId: string, userId: string, versionId: string): Promise<GameSummary> {
    const game = await this.requireOwnedGame(gameId, userId);
    if (game.moderationState === 'QUARANTINED') {
      throw new ConflictException('A quarantined game cannot be published');
    }
    const version = await this.versions.findById(versionId);
    if (!version || version.gameId !== gameId) {
      throw new NotFoundException('Version not found');
    }
    if (version.status !== 'READY') {
      throw new ConflictException('Only a scanned READY version can be published');
    }
    return this.versions.publish(gameId, versionId);
  }
}
