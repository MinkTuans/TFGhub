import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  ApplyMutationBatchInput,
  EngineProjectReadResponse,
  type EngineProjectReadResponse as EngineProjectReadResponseType,
  EngineProjectRevisionSummary,
  SaveEngineProjectInput,
} from '@indieforge/contracts';
import {
  adaptLegacyProject,
  EngineProjectV1,
  EngineProjectV2,
  applyProjectMutations,
  readEngineProject,
} from '@indieforge/engine-core';
import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import {
  EngineProjectsRepository,
  EngineProjectWriteForbiddenError,
  EngineProjectAssetReferenceError,
  type EngineProjectRecord,
  type StoredEngineRevision,
} from './engine-projects.repository.js';

const STANDARD_REVISION_LIMIT = 100;

function summary(revision: StoredEngineRevision): EngineProjectRevisionSummary {
  return {
    revisionNumber: revision.revisionNumber,
    schemaVersion: revision.schemaVersion,
    contentHash: revision.contentHash,
    byteSize: revision.byteSize,
    retention: revision.retention,
    createdAt: revision.createdAt.toISOString(),
  };
}

function snapshot(project: EngineProjectV1 | EngineProjectV2) {
  const document = canonicalize(project) as EngineProjectV1 | EngineProjectV2;
  const serialized = JSON.stringify(document);
  return {
    schemaVersion: project.schemaVersion,
    document,
    contentHash: createHash('sha256').update(serialized).digest('hex'),
    byteSize: Buffer.byteLength(serialized),
    assetIds: project.assetIds,
  };
}

function readOnly(
  reason:
    | 'UNSUPPORTED_FUTURE_SCHEMA'
    | 'UNSUPPORTED_LEGACY_SOURCE'
    | 'INVALID_PROJECT',
  raw: unknown,
  schemaVersion: number | null,
  diagnostics: string[],
): EngineProjectReadResponseType {
  return EngineProjectReadResponse.parse({
    status: 'READ_ONLY',
    reason,
    raw: raw ?? null,
    schemaVersion,
    diagnostics,
  });
}

@Injectable()
export class EngineProjectsService {
  constructor(
    @Inject(EngineProjectsRepository)
    private readonly projects: EngineProjectsRepository,
  ) {}

  private async owned(
    gameId: string,
    userId: string,
  ): Promise<EngineProjectRecord> {
    const record = await this.projects.findGameProject(gameId);
    if (!record || record.ownerId !== userId) {
      throw new ForbiddenException('You do not own this game');
    }
    return record;
  }

  private readStored(
    record: EngineProjectRecord,
  ): EngineProjectReadResponseType {
    const revision = record.project!.headRevision;
    const result = readEngineProject(revision.document);
    if (result.status === 'SUPPORTED') {
      return {
        status: 'SUPPORTED',
        project: result.project,
        revision: summary(revision),
      };
    }
    if (result.status === 'UNSUPPORTED_FUTURE_SCHEMA') {
      return readOnly(
        'UNSUPPORTED_FUTURE_SCHEMA',
        result.raw,
        result.schemaVersion,
        [],
      );
    }
    return readOnly('INVALID_PROJECT', result.raw, null, result.diagnostics);
  }

  async read(
    gameId: string,
    userId: string,
  ): Promise<EngineProjectReadResponseType> {
    const record = await this.owned(gameId, userId);
    if (record.project) return this.readStored(record);

    if (record.sourceType !== 'STORY' && record.sourceType !== 'PLATFORMER') {
      return readOnly('UNSUPPORTED_LEGACY_SOURCE', record.projectData, null, [
        `${record.sourceType} legacy projects are not supported by canonical adapters`,
      ]);
    }

    const adapted = adaptLegacyProject(gameId, record.projectData);
    if (adapted.status === 'CONVERTED') {
      return { status: 'SUPPORTED', project: adapted.project, revision: null };
    }
    return readOnly(
      adapted.status === 'UNSUPPORTED_SOURCE_TYPE'
        ? 'UNSUPPORTED_LEGACY_SOURCE'
        : 'INVALID_PROJECT',
      adapted.raw,
      null,
      adapted.diagnostics,
    );
  }

  async materialize(
    gameId: string,
    userId: string,
  ): Promise<EngineProjectReadResponseType> {
    const record = await this.owned(gameId, userId);
    if (record.project) return this.readStored(record);
    if (record.sourceType !== 'STORY' && record.sourceType !== 'PLATFORMER') {
      return readOnly('UNSUPPORTED_LEGACY_SOURCE', record.projectData, null, [
        `${record.sourceType} legacy projects are not supported by canonical adapters`,
      ]);
    }
    const adapted = adaptLegacyProject(gameId, record.projectData);
    if (adapted.status !== 'CONVERTED') {
      return readOnly(
        adapted.status === 'UNSUPPORTED_SOURCE_TYPE'
          ? 'UNSUPPORTED_LEGACY_SOURCE'
          : 'INVALID_PROJECT',
        adapted.raw,
        null,
        adapted.diagnostics,
      );
    }
    const data = snapshot(adapted.project);
    let revision: StoredEngineRevision;
    try {
      revision = await this.projects.materialize({
        gameId,
        projectId: adapted.project.projectId,
        authorId: userId,
        expectedSourceType: record.sourceType,
        expectedGameUpdatedAt: record.gameUpdatedAt,
        revisionNumber: 0,
        retention: 'PINNED',
        ...data,
      });
    } catch (error) {
      if (error instanceof EngineProjectWriteForbiddenError) {
        throw new ForbiddenException('You do not own this game');
      }
      throw error;
    }
    const authoritative = readEngineProject(revision.document);
    if (authoritative.status === 'SUPPORTED') {
      return {
        status: 'SUPPORTED',
        project: authoritative.project,
        revision: summary(revision),
      };
    }
    if (authoritative.status === 'UNSUPPORTED_FUTURE_SCHEMA') {
      return readOnly(
        'UNSUPPORTED_FUTURE_SCHEMA',
        authoritative.raw,
        authoritative.schemaVersion,
        [],
      );
    }
    return readOnly(
      'INVALID_PROJECT',
      authoritative.raw,
      null,
      authoritative.diagnostics,
    );
  }

  async save(
    gameId: string,
    userId: string,
    input: SaveEngineProjectInput,
  ): Promise<EngineProjectRevisionSummary> {
    const record = await this.owned(gameId, userId);
    if (!record.project)
      throw new ConflictException('Materialize the project before saving');
    const parsed = EngineProjectV1.safeParse(input.project);
    if (!parsed.success)
      throw new BadRequestException('Invalid canonical project');
    if (parsed.data.projectId !== record.project.id) {
      throw new BadRequestException('Project identity cannot be changed');
    }
    let result: Awaited<ReturnType<EngineProjectsRepository['saveRevision']>>;
    try {
      result = await this.projects.saveRevision({
        gameId,
        projectId: record.project.id,
        authorId: userId,
        baseRevision: input.baseRevision,
        revisionNumber: input.baseRevision + 1,
        retention: 'STANDARD',
        ...snapshot(parsed.data),
      });
    } catch (error) {
      if (error instanceof EngineProjectWriteForbiddenError) {
        throw new ForbiddenException('You do not own this game');
      }
      throw error;
    }
    if (result.status === 'CONFLICT') {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_REVISION_CONFLICT',
        currentRevision: result.currentRevision,
      });
    }
    try {
      await this.projects.compactStandardRevisions(
        record.project.id,
        STANDARD_REVISION_LIMIT,
      );
    } catch {
      // Saving succeeded in an earlier transaction; cleanup remains best effort.
    }
    return summary(result.revision);
  }

  async applyMutationBatch(
    gameId: string,
    userId: string,
    input: ApplyMutationBatchInput,
  ): Promise<EngineProjectReadResponseType> {
    const record = await this.owned(gameId, userId);
    if (!record.project)
      throw new ConflictException('Materialize the project before saving');
    const parsed = ApplyMutationBatchInput.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid mutation batch');
    let result: Awaited<
      ReturnType<EngineProjectsRepository['applyMutationBatch']>
    >;
    try {
      result = await this.projects.applyMutationBatch(
        {
          gameId,
          projectId: record.project.id,
          authorId: userId,
          baseRevision: parsed.data.baseRevision,
          mutationId: parsed.data.mutationId,
        },
        (revision) => {
          let document: EngineProjectV2;
          try {
            document = applyProjectMutations(
              EngineProjectV2.parse(revision.document),
              parsed.data.mutations,
            );
          } catch {
            throw new BadRequestException('Invalid V2 project mutation');
          }
          if (document.projectId !== record.project!.id)
            throw new BadRequestException('Project identity cannot be changed');
          return snapshot(document);
        },
      );
    } catch (error) {
      if (error instanceof EngineProjectWriteForbiddenError)
        throw new ForbiddenException('You do not own this game');
      if (error instanceof EngineProjectAssetReferenceError)
        throw new BadRequestException(error.message);
      throw error;
    }
    if (result.status === 'CONFLICT') {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_REVISION_CONFLICT',
        currentRevision: result.currentRevision,
      });
    }
    try {
      await this.projects.compactStandardRevisions(
        record.project.id,
        STANDARD_REVISION_LIMIT,
      );
    } catch {
      // The authoritative result has committed; cleanup remains best effort.
    }
    return EngineProjectReadResponse.parse({
      status: 'SUPPORTED',
      project: result.revision.document,
      revision: summary(result.revision),
    });
  }
}
