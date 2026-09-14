import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateGameProjectInput,
  GameProjectDocument,
  GameProjectPreview,
  GameProjectSummary,
  UpdateGameProjectInput,
} from '@indieforge/contracts';
import {
  compileHtml5Zip,
  compilePreviewHtml,
  phaser3StarterDocument,
} from './engine-compiler.js';
import { VersionsService } from './versions.service.js';

export type StoredProject = {
  id: string;
  gameId: string;
  templateId: string;
  formatVersion: string;
  document: GameProjectDocument;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class ProjectsRepository {
  abstract findGame(
    id: string,
  ): Promise<{ id: string; ownerId: string } | null>;
  abstract findByGameId(gameId: string): Promise<StoredProject | null>;
  abstract create(input: {
    gameId: string;
    templateId: string;
    formatVersion: string;
    document: GameProjectDocument;
  }): Promise<StoredProject>;
  abstract save(project: StoredProject): Promise<StoredProject>;
}

function summary(project: StoredProject): GameProjectSummary {
  return {
    id: project.id,
    gameId: project.gameId,
    templateId: project.templateId,
    formatVersion: project.formatVersion,
    document: project.document,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(ProjectsRepository)
    private readonly projects: ProjectsRepository,
    private readonly versions: VersionsService,
  ) {}

  private async requireOwned(gameId: string, userId: string) {
    const game = await this.projects.findGame(gameId);
    if (!game || game.ownerId !== userId) {
      throw new ForbiddenException('You do not own this game');
    }
    return game;
  }

  private async requireProject(gameId: string, userId: string) {
    await this.requireOwned(gameId, userId);
    const project = await this.projects.findByGameId(gameId);
    if (!project) throw new NotFoundException('Engine project not found');
    return project;
  }

  async create(
    gameId: string,
    userId: string,
    input: CreateGameProjectInput,
  ): Promise<GameProjectSummary> {
    await this.requireOwned(gameId, userId);
    try {
      const project = await this.projects.create({
        gameId,
        templateId: input.template,
        formatVersion: '1',
        document: phaser3StarterDocument(),
      });
      return summary(project);
    } catch (error) {
      const failure = error as {
        code?: unknown;
        meta?: { target?: unknown };
      } | null;
      if (
        failure?.code === 'P2002' &&
        Array.isArray(failure.meta?.target) &&
        failure.meta.target.includes('gameId')
      ) {
        throw new ConflictException('Engine project already exists');
      }
      throw error;
    }
  }

  async get(gameId: string, userId: string): Promise<GameProjectSummary> {
    return summary(await this.requireProject(gameId, userId));
  }

  async update(
    gameId: string,
    userId: string,
    input: UpdateGameProjectInput,
  ): Promise<GameProjectSummary> {
    const project = await this.requireProject(gameId, userId);
    project.document = input.document;
    return summary(await this.projects.save(project));
  }

  async preview(gameId: string, userId: string): Promise<GameProjectPreview> {
    const project = await this.requireProject(gameId, userId);
    return { html: compilePreviewHtml(project.document) };
  }

  async build(gameId: string, userId: string) {
    const project = await this.requireProject(gameId, userId);
    const archive = await compileHtml5Zip(project.document);
    return this.versions.ingestOwnedZip(gameId, userId, 'engine.zip', archive);
  }
}
