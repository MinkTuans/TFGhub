import { database, type GameAsset } from '@indieforge/database';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ListGameAssetsInput } from '@indieforge/contracts';
import { assetStorageKey } from './asset-storage.js';

type Client = typeof database;
export type AssetRecord = GameAsset & {
  _count: { revisions: number; builds: number };
};
export const assetIncludes = {
  _count: { select: { revisions: true, builds: true } },
} as const;

export class GameAssetsRepository {
  constructor(private readonly client: Client = database) {}
  async owned(gameId: string, userId: string) {
    const project = await this.client.engineProject.findUnique({
      where: { gameId },
      include: { game: { select: { ownerId: true } } },
    });
    if (!project || project.game.ownerId !== userId)
      throw new ForbiddenException('You do not own this project');
    return project.id;
  }
  async withOwner<T>(
    gameId: string,
    userId: string,
    operation: (tx: Client, projectId: string) => Promise<T>,
  ) {
    return this.client.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT "id" FROM "Game" WHERE "id" = ${gameId} AND "ownerId" = ${userId} FOR UPDATE`;
        if (!rows.length)
          throw new ForbiddenException('You do not own this project');
        const project = await tx.engineProject.findUnique({
          where: { gameId },
        });
        if (!project) throw new NotFoundException('Project not found');
        return operation(tx as Client, project.id);
      },
      { timeout: 20000 },
    );
  }
  async locked(
    tx: Client,
    projectId: string,
    id: string,
  ): Promise<AssetRecord> {
    await tx.$queryRaw`SELECT "id" FROM "GameAsset" WHERE "id" = ${id} AND "projectId" = ${projectId} FOR UPDATE`;
    const row = await tx.gameAsset.findFirst({
      where: { id, projectId },
      include: assetIncludes,
    });
    if (!row) throw new NotFoundException('Asset not found');
    return row;
  }
  async find(projectId: string, id: string): Promise<AssetRecord> {
    const row = await this.client.gameAsset.findFirst({
      where: { id, projectId },
      include: assetIncludes,
    });
    if (!row) throw new NotFoundException('Asset not found');
    return row;
  }
  async list(
    projectId: string,
    query: ListGameAssetsInput,
  ): Promise<{
    items: AssetRecord[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const where = {
      projectId,
      state: query.state,
      kind: query.kind,
      displayName: { contains: query.search, mode: 'insensitive' as const },
      ...(query.category
        ? { metadata: { path: ['category'], equals: query.category } }
        : {}),
    };
    const [items, total] = await this.client.$transaction([
      this.client.gameAsset.findMany({
        where,
        include: assetIncludes,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.client.gameAsset.count({ where }),
    ]);
    return { items, total, offset: query.offset, limit: query.limit };
  }
  async reserve(
    gameId: string,
    userId: string,
    data: Omit<GameAsset, 'createdAt' | 'updatedAt' | 'tombstonedAt'>,
  ): Promise<AssetRecord> {
    return this.withOwner(gameId, userId, async (tx, projectId) => {
      if (projectId !== data.projectId)
        throw new ConflictException('Project changed');
      const prior = await tx.gameAsset.findUnique({
        where: { id: data.id },
        include: assetIncludes,
      });
      if (prior) {
        if (
          prior.projectId !== projectId ||
          prior.contentHash !== data.contentHash ||
          prior.mimeType !== data.mimeType ||
          prior.byteSize !== data.byteSize
        )
          throw new ConflictException('Upload identity already used');
        return prior;
      }
      return tx.gameAsset.create({
        data: { ...data, metadata: data.metadata as never },
        include: assetIncludes,
      });
    });
  }
  async claimGarbage(id: string): Promise<AssetRecord | null> {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GameAsset" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.gameAsset.findUnique({
        where: { id },
        include: assetIncludes,
      });
      if (
        !row ||
        !['TOMBSTONED', 'GC_PENDING'].includes(row.state) ||
        row._count.revisions ||
        row._count.builds
      )
        return null;
      // Older assets may use another storage layout. Its owning importer must
      // define collection; claiming it here would hide bytes we cannot remove.
      try {
        if (
          row.storageKey !==
          assetStorageKey(row.projectId, row.id, row.contentHash)
        )
          return null;
      } catch {
        return null;
      }
      return tx.gameAsset.update({
        where: { id },
        data: { state: 'GC_PENDING' },
        include: assetIncludes,
      });
    });
  }
}
