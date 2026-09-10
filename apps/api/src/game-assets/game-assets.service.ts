import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AssetImportMetadata,
  ListGameAssetsInput,
  UpdateGameAssetInput,
  UploadGameAssetInput,
  type GameAssetSummary,
} from '@indieforge/contracts';
import {
  AssetStorage,
  assetStorageKey,
  thumbnailStorageKey,
} from './asset-storage.js';
import {
  assetHash,
  prepareAsset,
  type AssetUpload,
  type PreparedAsset,
} from './asset-types.js';
import { isDeepStrictEqual } from 'node:util';
import {
  assetIncludes,
  GameAssetsRepository,
  type AssetRecord,
} from './game-assets.repository.js';

@Injectable()
export class GameAssetsService {
  constructor(
    @Inject(GameAssetsRepository)
    private readonly repository: GameAssetsRepository,
    @Inject(AssetStorage) private readonly storage: AssetStorage,
  ) {}
  owned(gameId: string, userId: string) {
    return this.repository.owned(gameId, userId);
  }
  private assertUploadIdentity(
    row: AssetRecord,
    expected: Pick<
      AssetRecord,
      | 'id'
      | 'projectId'
      | 'kind'
      | 'storageKey'
      | 'contentHash'
      | 'mimeType'
      | 'byteSize'
    >,
    prepared: PreparedAsset,
  ) {
    const { category: _actualCategory, ...actualMetadata } =
      AssetImportMetadata.parse(row.metadata);
    const { category: _expectedCategory, ...preparedMetadata } =
      prepared.metadata;
    const finalized = row.state !== 'UPLOADING';
    if (
      row.id !== expected.id ||
      row.projectId !== expected.projectId ||
      row.kind !== expected.kind ||
      row.storageKey !== expected.storageKey ||
      row.contentHash !== expected.contentHash ||
      row.mimeType !== expected.mimeType ||
      row.byteSize !== expected.byteSize ||
      row.width !== (finalized ? prepared.width : null) ||
      row.height !== (finalized ? prepared.height : null) ||
      row.durationMs !== (finalized ? prepared.durationMs : null) ||
      !isDeepStrictEqual(actualMetadata, finalized ? preparedMetadata : {})
    )
      throw new ConflictException('Upload identity already used');
  }
  private summary(gameId: string, row: AssetRecord): GameAssetSummary {
    const metadata = AssetImportMetadata.parse(row.metadata);
    const readable = row.state === 'READY' || row.state === 'TOMBSTONED';
    const route = `/games/${encodeURIComponent(gameId)}/assets/${encodeURIComponent(row.id)}`;
    return {
      id: row.id,
      projectId: row.projectId,
      displayName: row.displayName,
      kind: row.kind,
      state: row.state,
      contentHash: row.contentHash,
      mimeType: row.mimeType,
      byteSize: Number(row.byteSize),
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      metadata,
      references: row._count,
      contentUrl: readable ? `${route}/content` : null,
      thumbnailUrl:
        readable && metadata.thumbnail ? `${route}/thumbnail` : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      tombstonedAt: row.tombstonedAt?.toISOString() ?? null,
    };
  }
  async upload(
    gameId: string,
    userId: string,
    body: unknown,
    file?: AssetUpload,
  ) {
    const projectId = await this.owned(gameId, userId);
    const input = UploadGameAssetInput.safeParse(body);
    if (!input.success || !file)
      throw new BadRequestException('Provide valid upload fields and one file');
    const display = UploadGameAssetInput.safeParse({
      ...input.data,
      displayName: input.data.displayName ?? file.originalname,
    });
    if (!display.success) throw new BadRequestException('Invalid asset name');
    if (
      !UploadGameAssetInput.safeParse({
        ...input.data,
        displayName: file.originalname,
      }).success
    )
      throw new BadRequestException('Invalid asset filename');
    const prepared = await prepareAsset(file);
    const contentHash = assetHash(file.buffer);
    const reservation = {
      id: input.data.uploadId,
      projectId,
      kind: prepared.kind,
      displayName: display.data.displayName!,
      state: 'UPLOADING',
      storageKey: assetStorageKey(projectId, input.data.uploadId, contentHash),
      contentHash,
      mimeType: prepared.mimeType,
      byteSize: BigInt(file.buffer.length),
      width: null,
      height: null,
      durationMs: null,
      metadata: { category: input.data.category },
    } as const;
    const row = await this.repository.reserve(gameId, userId, reservation);
    try {
      return await this.repository.withOwner(
        gameId,
        userId,
        async (tx, project) => {
          const fresh = await this.repository.locked(tx, project, row.id);
          this.assertUploadIdentity(fresh, reservation, prepared);
          if (fresh.state === 'READY')
            await this.storage.install(
              fresh.storageKey,
              file.buffer,
              prepared.thumbnail,
            );
          if (fresh.state !== 'UPLOADING') return this.summary(gameId, fresh);
          await this.storage.install(
            fresh.storageKey,
            file.buffer,
            prepared.thumbnail,
          );
          const ready = await tx.gameAsset.update({
            where: { id: row.id },
            data: {
              state: 'READY',
              kind: prepared.kind,
              mimeType: prepared.mimeType,
              width: prepared.width,
              height: prepared.height,
              durationMs: prepared.durationMs,
              metadata: {
                ...prepared.metadata,
                category: input.data.category,
              } as never,
            },
            include: assetIncludes,
          });
          return this.summary(gameId, ready);
        },
      );
    } catch (error) {
      // Waiting on the same owner/asset locks resolves an uncertain commit. If
      // it did not commit, keep sealed bytes and UPLOADING for an exact retry.
      try {
        const reconciled = await this.repository.withOwner(
          gameId,
          userId,
          async (tx, project) => {
            const fresh = await this.repository.locked(tx, project, row.id);
            this.assertUploadIdentity(fresh, reservation, prepared);
            if (fresh.state === 'READY')
              await this.storage.install(
                fresh.storageKey,
                file.buffer,
                prepared.thumbnail,
              );
            return fresh.state === 'UPLOADING'
              ? null
              : this.summary(gameId, fresh);
          },
        );
        if (reconciled) return reconciled;
      } catch (reconciliationError) {
        if (reconciliationError instanceof ConflictException)
          throw reconciliationError;
        /* DB unavailable: retain all potentially committed bytes. */
      }
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'Asset finalization unavailable; retry the same uploadId and bytes',
      );
    }
  }
  async list(gameId: string, userId: string, raw: unknown) {
    const project = await this.owned(gameId, userId);
    const query = ListGameAssetsInput.safeParse(raw);
    if (!query.success) throw new BadRequestException('Invalid asset query');
    const result = await this.repository.list(project, query.data);
    return {
      ...result,
      items: result.items.map((row) => this.summary(gameId, row)),
    };
  }
  async get(gameId: string, userId: string, id: string) {
    return this.summary(
      gameId,
      await this.repository.find(await this.owned(gameId, userId), id),
    );
  }
  async update(gameId: string, userId: string, id: string, raw: unknown) {
    const input = UpdateGameAssetInput.safeParse(raw);
    if (!input.success) throw new BadRequestException('Invalid asset update');
    return this.repository.withOwner(gameId, userId, async (tx, project) => {
      const row = await this.repository.locked(tx, project, id);
      if (row.state !== 'READY')
        throw new ConflictException('Asset is not ready');
      const metadata = AssetImportMetadata.parse(row.metadata);
      return this.summary(
        gameId,
        await tx.gameAsset.update({
          where: { id },
          data: {
            displayName: input.data.displayName,
            metadata: {
              ...metadata,
              ...(input.data.category ? { category: input.data.category } : {}),
            } as never,
          },
          include: assetIncludes,
        }),
      );
    });
  }
  async tombstone(gameId: string, userId: string, id: string) {
    return this.repository.withOwner(gameId, userId, async (tx, project) => {
      const row = await this.repository.locked(tx, project, id);
      if (row.state === 'UPLOADING')
        throw new ConflictException('Upload is in progress');
      if (row.state !== 'READY') return this.summary(gameId, row);
      return this.summary(
        gameId,
        await tx.gameAsset.update({
          where: { id },
          data: { state: 'TOMBSTONED', tombstonedAt: new Date() },
          include: assetIncludes,
        }),
      );
    });
  }
  async read(gameId: string, userId: string, id: string, thumbnail: boolean) {
    return this.repository.withOwner(gameId, userId, async (tx, project) => {
      // Hold the asset row lock until bytes are in memory. GC cannot claim or
      // unlink the source while an authorized read still depends on its file.
      const row = await this.repository.locked(tx, project, id);
      if (!['READY', 'TOMBSTONED'].includes(row.state))
        throw new NotFoundException('Asset not found');
      const metadata = AssetImportMetadata.parse(row.metadata);
      if (thumbnail && !metadata.thumbnail)
        throw new NotFoundException('Thumbnail not found');
      try {
        const content = await this.storage.read(
          thumbnail
            ? thumbnailStorageKey(row.storageKey, metadata.thumbnail!.recipe)
            : row.storageKey,
        );
        if (
          assetHash(content) !==
          (thumbnail ? metadata.thumbnail!.contentHash : row.contentHash)
        )
          throw new Error('Content hash mismatch');
        return { content, contentType: thumbnail ? 'image/png' : row.mimeType };
      } catch {
        throw new NotFoundException('Asset content not available');
      }
    });
  }
  /** Internal worker entry only. A durable claim forbids all future references;
   * retained GC_PENDING rows make failed/repeated physical cleanup resumable. */
  async collectGarbage(id: string) {
    const row = await this.repository.claimGarbage(id);
    if (!row) return false;
    await this.storage.discardClaimed(row.storageKey);
    return true;
  }
}
