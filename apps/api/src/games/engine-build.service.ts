import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EngineProjectV2, compileEngineHtml } from '@indieforge/engine-core';
import { database } from '@indieforge/database';
import { EngineProjectsRepository } from '../engine-projects/engine-projects.repository.js';
import { GameAssetsService } from '../game-assets/game-assets.service.js';
import type { ArtifactFile } from '../game-artifacts/artifact-types.js';

@Injectable()
export class EngineBuildRecords {
  async begin(
    gameId: string,
    ownerId: string,
    revisionId: string,
    assetIds: string[],
  ) {
    return database.$transaction(async (tx) => {
      // Pin provenance before reading bytes so compaction cannot remove the source.
      const assets = await tx.engineRevisionAsset.findMany({
        where: { revisionId },
      });
      if (assetIds.some((id) => !assets.some((asset) => asset.assetId === id)))
        throw new BadRequestException(
          'Project assets have no owned revision references',
        );
      const build = await tx.gameBuild.create({
        data: {
          gameId,
          creatorId: ownerId,
          engineRevisionId: revisionId,
          state: 'BUILDING',
          runtimeFamily: 'TFG_ENGINE',
          runtimeVersion: 'pixel-1',
          assets: {
            create: assets.map((asset) => ({
              assetId: asset.assetId,
              contentHash: asset.contentHash,
            })),
          },
        },
      });
      return build.id;
    });
  }
  async fail(id: string) {
    await database.gameBuild.updateMany({
      where: { id, state: 'BUILDING' },
      data: { state: 'FAILED', completedAt: new Date() },
    });
  }
}

@Injectable()
export class EngineBuildService {
  constructor(
    @Inject(EngineProjectsRepository)
    private readonly projects: EngineProjectsRepository,
    @Inject(GameAssetsService) private readonly assets: GameAssetsService,
    @Inject(EngineBuildRecords) private readonly records: EngineBuildRecords,
  ) {}

  async prepare(gameId: string, ownerId: string, expectedUpdatedAt: Date) {
    const record = await this.projects.findGameProject(gameId);
    if (!record || record.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this game');
    if (record.gameUpdatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw new ConflictException('Game changed; save and build again');
    if (record.sourceType !== 'ENGINE' || !record.project)
      throw new BadRequestException('No engine project to build');
    const parsed = EngineProjectV2.safeParse(
      record.project.headRevision.document,
    );
    if (!parsed.success)
      throw new BadRequestException(
        'This project cannot be built by Pixel Studio',
      );
    const project = parsed.data;
    const buildId = await this.records.begin(
      gameId,
      ownerId,
      record.project.headRevision.id,
      project.assetIds,
    );
    try {
      const files: ArtifactFile[] = [];
      const urls: Record<string, string> = {};
      let total = 0;
      const extensions: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
      };
      for (const id of project.assetIds) {
        const asset = await this.assets.read(gameId, ownerId, id, false);
        total += asset.content.byteLength;
        if (total > 100 * 1024 * 1024)
          throw new BadRequestException('Build assets exceed 100 MiB');
        const extension = extensions[asset.contentType];
        if (!extension)
          throw new BadRequestException('Unsupported engine asset format');
        const path = `assets/${id}.${extension}`;
        urls[id] = path;
        files.push({
          path,
          content: asset.content,
          contentType: asset.contentType,
        });
      }
      files.unshift({
        path: 'index.html',
        contentType: 'text/html; charset=utf-8',
        content: compileEngineHtml(project, urls),
      });
      return {
        buildId,
        revisionNumber: record.project.headRevision.revisionNumber,
        files,
        contentHash: record.project.headRevision.contentHash,
        viewport: project.settings.viewport,
      };
    } catch (error) {
      await this.records.fail(buildId);
      throw error;
    }
  }
  fail(id: string) {
    return this.records.fail(id);
  }
}
