import type { GameSourceType } from '@indieforge/contracts';

export type StoredEngineRevision = {
  id: string;
  projectId: string;
  revisionNumber: number;
  schemaVersion: number;
  document: unknown;
  contentHash: string;
  byteSize: number;
  retention: 'STANDARD' | 'PINNED';
  createdAt: Date;
};

export type EngineProjectRecord = {
  gameId: string;
  ownerId: string;
  sourceType: GameSourceType;
  gameUpdatedAt: Date;
  projectData: unknown;
  project: null | {
    id: string;
    headRevisionNumber: number;
    headRevision: StoredEngineRevision;
  };
};

export type RevisionWrite = {
  gameId: string;
  projectId: string;
  authorId: string;
  baseRevision: number;
  revisionNumber: number;
  schemaVersion: number;
  document: unknown;
  contentHash: string;
  byteSize: number;
  retention: 'STANDARD' | 'PINNED';
  assetIds: string[];
};

export type MaterializeWrite = Omit<RevisionWrite, 'baseRevision'> & {
  expectedSourceType: 'STORY' | 'PLATFORMER';
  expectedGameUpdatedAt: Date;
};

export abstract class EngineProjectsRepository {
  abstract findGameProject(gameId: string): Promise<EngineProjectRecord | null>;
  abstract materialize(input: MaterializeWrite): Promise<StoredEngineRevision>;
  abstract saveRevision(
    input: RevisionWrite,
  ): Promise<
    | { status: 'SAVED'; revision: StoredEngineRevision }
    | { status: 'CONFLICT'; currentRevision: number }
  >;
  abstract compactStandardRevisions(
    projectId: string,
    keep: number,
  ): Promise<void>;
}

export class EngineProjectWriteForbiddenError extends Error {}

type DatabaseClient = typeof database;

function storedRevision(revision: {
  id: string;
  projectId: string;
  revisionNumber: number;
  schemaVersion: number;
  document: unknown;
  contentHash: string;
  byteSize: bigint;
  retention: 'STANDARD' | 'PINNED';
  createdAt: Date;
}): StoredEngineRevision {
  const byteSize = Number(revision.byteSize);
  if (!Number.isSafeInteger(byteSize))
    throw new Error('Revision byte size exceeds the API range');
  return { ...revision, byteSize };
}

async function assetReferences(
  client: DatabaseClient,
  projectId: string,
  assetIds: string[],
) {
  if (assetIds.length === 0) return [];
  const assets = await client.gameAsset.findMany({
    where: { id: { in: assetIds }, projectId, state: 'READY' },
    select: { id: true, contentHash: true },
  });
  if (assets.length !== assetIds.length) {
    throw new Error('Project contains unavailable or foreign asset references');
  }
  const hashes = new Map(assets.map((asset) => [asset.id, asset.contentHash]));
  return assetIds.map((assetId) => ({
    assetId,
    contentHash: hashes.get(assetId)!,
  }));
}

async function lockOwnedGame(
  client: DatabaseClient,
  gameId: string,
  ownerId: string,
  expectedLegacy?: { sourceType: 'STORY' | 'PLATFORMER'; updatedAt: Date },
) {
  const rows = expectedLegacy
    ? await client.$queryRaw<Array<{ sourceType: string }>>`
        SELECT "sourceType" FROM "Game"
        WHERE "id" = ${gameId}
          AND "ownerId" = ${ownerId}
          AND "sourceType"::text = ${expectedLegacy.sourceType}
          AND "updatedAt" = ${expectedLegacy.updatedAt}
        FOR UPDATE
      `
    : await client.$queryRaw<Array<{ sourceType: string }>>`
        SELECT "sourceType" FROM "Game"
        WHERE "id" = ${gameId} AND "ownerId" = ${ownerId}
        FOR UPDATE
      `;
  const game = rows[0];
  if (!game) {
    throw new EngineProjectWriteForbiddenError();
  }
}

async function exactProject(client: DatabaseClient, gameId: string) {
  const project = await client.engineProject.findUnique({
    where: { gameId },
    select: { id: true, headRevisionNumber: true },
  });
  if (!project) return null;
  const headRevision = await client.engineProjectRevision.findUnique({
    where: {
      projectId_revisionNumber: {
        projectId: project.id,
        revisionNumber: project.headRevisionNumber,
      },
    },
  });
  if (!headRevision)
    throw new Error('Engine project has no exact head revision');
  return { ...project, headRevision: storedRevision(headRevision) };
}

export class PrismaEngineProjectsRepository extends EngineProjectsRepository {
  constructor(private readonly client: DatabaseClient = database) {
    super();
  }

  async findGameProject(gameId: string): Promise<EngineProjectRecord | null> {
    return this.client.$transaction(async (transaction) => {
      const game = await transaction.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          ownerId: true,
          sourceType: true,
          projectData: true,
          updatedAt: true,
        },
      });
      if (!game) return null;
      return {
        gameId: game.id,
        ownerId: game.ownerId,
        sourceType: game.sourceType,
        gameUpdatedAt: game.updatedAt,
        projectData: game.projectData,
        project: await exactProject(transaction as DatabaseClient, gameId),
      };
    });
  }

  materialize(input: MaterializeWrite): Promise<StoredEngineRevision> {
    return this.client.$transaction(async (transaction) => {
      await lockOwnedGame(
        transaction as DatabaseClient,
        input.gameId,
        input.authorId,
        {
          sourceType: input.expectedSourceType,
          updatedAt: input.expectedGameUpdatedAt,
        },
      );
      const existing = await exactProject(
        transaction as DatabaseClient,
        input.gameId,
      );
      if (existing) {
        if (existing.id !== input.projectId) {
          throw new Error('Materialized project identity does not match');
        }
        return existing.headRevision;
      }
      const references = await assetReferences(
        transaction as DatabaseClient,
        input.projectId,
        input.assetIds,
      );
      const project = await transaction.engineProject.create({
        data: {
          id: input.projectId,
          gameId: input.gameId,
          headRevisionNumber: input.revisionNumber,
          revisions: {
            create: {
              revisionNumber: input.revisionNumber,
              schemaVersion: input.schemaVersion,
              document: input.document as never,
              contentHash: input.contentHash,
              byteSize: BigInt(input.byteSize),
              retention: input.retention,
              authorId: input.authorId,
              assets: { create: references },
            },
          },
        },
        include: { revisions: true },
      });
      return storedRevision(project.revisions[0]!);
    });
  }

  saveRevision(input: RevisionWrite) {
    return this.client.$transaction(async (transaction) => {
      await lockOwnedGame(
        transaction as DatabaseClient,
        input.gameId,
        input.authorId,
      );
      const advanced = await transaction.engineProject.updateMany({
        where: {
          id: input.projectId,
          gameId: input.gameId,
          headRevisionNumber: input.baseRevision,
        },
        data: { headRevisionNumber: input.revisionNumber },
      });
      if (advanced.count !== 1) {
        const current = await transaction.engineProject.findUnique({
          where: { id: input.projectId },
          select: { headRevisionNumber: true },
        });
        return {
          status: 'CONFLICT' as const,
          currentRevision: current?.headRevisionNumber ?? input.baseRevision,
        };
      }
      const references = await assetReferences(
        transaction as DatabaseClient,
        input.projectId,
        input.assetIds,
      );
      const revision = await transaction.engineProjectRevision.create({
        data: {
          projectId: input.projectId,
          revisionNumber: input.revisionNumber,
          schemaVersion: input.schemaVersion,
          document: input.document as never,
          contentHash: input.contentHash,
          byteSize: BigInt(input.byteSize),
          retention: input.retention,
          authorId: input.authorId,
          assets: { create: references },
        },
      });
      return { status: 'SAVED' as const, revision: storedRevision(revision) };
    });
  }

  async compactStandardRevisions(
    projectId: string,
    keep: number,
  ): Promise<void> {
    await this.client.$executeRaw`
      DELETE FROM "EngineProjectRevision"
       WHERE "id" IN (
         SELECT revision."id"
         FROM "EngineProjectRevision" revision
         WHERE revision."projectId" = ${projectId}
           AND revision."retention" = 'STANDARD'
           AND NOT EXISTS (
             SELECT 1 FROM "GameBuild" build
             WHERE build."engineRevisionId" = revision."id"
           )
         ORDER BY revision."revisionNumber" DESC
         OFFSET ${keep}
       )
    `;
  }
}
import { database } from '@indieforge/database';
