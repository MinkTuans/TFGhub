import { database } from '@indieforge/database';
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { EngineProjectsController } from '../src/engine-projects/engine-projects.controller.js';
import { PrismaEngineProjectsRepository } from '../src/engine-projects/engine-projects.repository.js';
import { EngineProjectsService } from '../src/engine-projects/engine-projects.service.js';

describe('engine project HTTP boundary', () => {
  let app: INestApplication;
  const service = {
    read: vi.fn(async () => ({
      status: 'SUPPORTED',
      project: project(),
      revision: null,
    })),
    materialize: vi.fn(async () => ({
      status: 'SUPPORTED',
      project: project(),
      revision: null,
    })),
    save: vi.fn(async () => ({
      revisionNumber: 1,
      schemaVersion: 1,
      contentHash: 'a'.repeat(64),
      byteSize: 100,
      retention: 'STANDARD',
      createdAt: '2026-09-09T00:00:00.000Z',
    })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [EngineProjectsController],
      providers: [{ provide: EngineProjectsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) {
          context.switchToHttp().getRequest().user = {
            id: 'owner-1',
            email: 'owner@example.test',
            role: 'USER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app?.close());

  it('exposes owner read and materialize routes', async () => {
    await request(app.getHttpServer())
      .get('/games/game-1/engine-project')
      .expect(200);
    await request(app.getHttpServer())
      .post('/games/game-1/engine-project/materialize')
      .expect(201);
    expect(service.read).toHaveBeenCalledWith('game-1', 'owner-1');
    expect(service.materialize).toHaveBeenCalledWith('game-1', 'owner-1');
  });

  it('validates save input before calling the service', async () => {
    await request(app.getHttpServer())
      .put('/games/game-1/engine-project')
      .send({ baseRevision: -1, project: project() })
      .expect(400);
    expect(service.save).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .put('/games/game-1/engine-project')
      .send({ baseRevision: 0, project: project() })
      .expect(200);
    expect(service.save).toHaveBeenCalledWith('game-1', 'owner-1', {
      baseRevision: 0,
      project: project(),
    });
  });
});

const describeDatabase = process.env.ENGINE_PROJECTS_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const ids = {
  project: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  scene: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  missingAsset: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

function project(assetIds: string[] = []) {
  return {
    schemaVersion: 1,
    projectId: ids.project,
    engineFamily: 'TFG_ENGINE',
    entrySceneId: ids.scene,
    settings: { viewport: { width: 640, height: 480 } },
    assetIds,
    scenes: [{ id: ids.scene, name: 'Scene', order: 0, objects: [] }],
    variables: { global: [], player: [], scene: {} },
    events: [],
    prefabs: [],
  };
}

describeDatabase('engine project revision persistence', () => {
  const repository = new PrismaEngineProjectsRepository(database);
  const service = new EngineProjectsService(repository);

  beforeEach(async () => {
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE "GameRelease", "GameBuildAsset", "GameBuild",
        "EngineRevisionAsset", "GameAsset", "EngineProjectRevision",
        "EngineProject", "Game", "DeveloperProfile", "User" CASCADE
    `);
    await database.user.create({
      data: {
        id: 'owner-1',
        email: 'owner@example.test',
        passwordHash: 'hash',
      },
    });
    await database.game.create({
      data: {
        id: 'game-1',
        ownerId: 'owner-1',
        slug: 'game-one',
        title: 'Game One',
      },
    });
    await database.engineProject.create({
      data: {
        id: ids.project,
        gameId: 'game-1',
        headRevisionNumber: 0,
        revisions: {
          create: {
            revisionNumber: 0,
            schemaVersion: 1,
            document: project(),
            contentHash: 'a'.repeat(64),
            byteSize: 100,
            retention: 'PINNED',
            authorId: 'owner-1',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it('allows exactly one of two tabs to save the same base revision', async () => {
    const results = await Promise.allSettled([
      service.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: project(),
      }),
      service.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: project(),
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: {
        response: { code: 'PROJECT_REVISION_CONFLICT', currentRevision: 1 },
      },
    });
    await expect(
      database.engineProject.findUnique({ where: { id: ids.project } }),
    ).resolves.toMatchObject({ headRevisionNumber: 1 });
    await expect(
      database.engineProjectRevision.count({
        where: { projectId: ids.project },
      }),
    ).resolves.toBe(2);
  });

  it('materializes legacy STORY data as pinned revision zero', async () => {
    await database.engineProject.delete({ where: { id: ids.project } });
    await database.game.update({
      where: { id: 'game-1' },
      data: {
        sourceType: 'STORY',
        projectData: {
          sourceType: 'STORY',
          startSceneId: 'intro',
          scenes: [
            {
              id: 'intro',
              speaker: 'Guide',
              dialogue: 'Hello',
              backgroundColor: '#112233',
              choices: [],
            },
          ],
        },
      },
    });

    const response = await service.materialize('game-1', 'owner-1');

    expect(response).toMatchObject({
      status: 'SUPPORTED',
      revision: { revisionNumber: 0, retention: 'PINNED' },
    });
    const stored = await database.engineProject.findUniqueOrThrow({
      where: { gameId: 'game-1' },
      include: { revisions: true },
    });
    expect(stored.headRevisionNumber).toBe(0);
    expect(stored.revisions).toHaveLength(1);
    expect(stored.revisions[0]).toMatchObject({
      revisionNumber: 0,
      retention: 'PINNED',
    });
  });

  it('makes concurrent legacy materialization idempotent', async () => {
    await database.engineProject.delete({ where: { id: ids.project } });
    await database.game.update({
      where: { id: 'game-1' },
      data: {
        sourceType: 'STORY',
        projectData: {
          sourceType: 'STORY',
          startSceneId: 'intro',
          scenes: [
            {
              id: 'intro',
              speaker: '',
              dialogue: '',
              backgroundColor: '#112233',
              choices: [],
            },
          ],
        },
      },
    });

    const results = await Promise.all([
      service.materialize('game-1', 'owner-1'),
      service.materialize('game-1', 'owner-1'),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      database.engineProject.count({ where: { gameId: 'game-1' } }),
    ).resolves.toBe(1);
    await expect(database.engineProjectRevision.count()).resolves.toBe(1);
  });

  it('reads the declared head rather than a numerically newer orphan revision', async () => {
    await database.engineProjectRevision.create({
      data: {
        projectId: ids.project,
        revisionNumber: 1,
        schemaVersion: 1,
        document: { schemaVersion: 9, orphan: true },
        contentHash: 'b'.repeat(64),
        byteSize: 10,
        retention: 'STANDARD',
        authorId: 'owner-1',
      },
    });

    const record = await repository.findGameProject('game-1');
    expect(record?.project?.headRevision.revisionNumber).toBe(0);
    expect(record?.project?.headRevision.document).toEqual(project());
  });

  it('rechecks ownership inside the save transaction', async () => {
    await database.user.create({
      data: {
        id: 'owner-2',
        email: 'owner2@example.test',
        passwordHash: 'hash',
      },
    });
    const raceRepository = new Proxy(repository, {
      get(target, property, receiver) {
        if (property !== 'findGameProject')
          return Reflect.get(target, property, receiver);
        return async (gameId: string) => {
          const record = await target.findGameProject(gameId);
          await database.game.update({
            where: { id: gameId },
            data: { ownerId: 'owner-2' },
          });
          return record;
        };
      },
    });
    const raceService = new EngineProjectsService(raceRepository);

    await expect(
      raceService.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: project(),
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      database.engineProject.findUnique({ where: { id: ids.project } }),
    ).resolves.toMatchObject({ headRevisionNumber: 0 });
    await expect(database.engineProjectRevision.count()).resolves.toBe(1);
  });

  it('rejects materialization when legacy data changes before the transaction lock', async () => {
    await database.engineProject.delete({ where: { id: ids.project } });
    const legacy = {
      sourceType: 'STORY' as const,
      startSceneId: 'intro',
      scenes: [
        {
          id: 'intro',
          speaker: '',
          dialogue: 'old',
          backgroundColor: '#112233',
          choices: [],
        },
      ],
    };
    await database.game.update({
      where: { id: 'game-1' },
      data: { sourceType: 'STORY', projectData: legacy },
    });
    const raceRepository = new Proxy(repository, {
      get(target, property, receiver) {
        if (property !== 'findGameProject')
          return Reflect.get(target, property, receiver);
        return async (gameId: string) => {
          const record = await target.findGameProject(gameId);
          await database.game.update({
            where: { id: gameId },
            data: {
              projectData: {
                ...legacy,
                scenes: [{ ...legacy.scenes[0], dialogue: 'new' }],
              },
            },
          });
          return record;
        };
      },
    });
    const raceService = new EngineProjectsService(raceRepository);

    await expect(raceService.materialize('game-1', 'owner-1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      database.engineProject.count({ where: { gameId: 'game-1' } }),
    ).resolves.toBe(0);
  });

  it('rolls back head advancement and revision insertion when an asset reference is invalid', async () => {
    await expect(
      service.save('game-1', 'owner-1', {
        baseRevision: 0,
        project: project([ids.missingAsset]),
      }),
    ).rejects.toThrow();

    await expect(
      database.engineProject.findUnique({ where: { id: ids.project } }),
    ).resolves.toMatchObject({ headRevisionNumber: 0 });
    await expect(
      database.engineProjectRevision.count({
        where: { projectId: ids.project },
      }),
    ).resolves.toBe(1);
    await expect(database.engineRevisionAsset.count()).resolves.toBe(0);
  });

  it('keeps the newest 100 unreferenced standard revisions plus pinned and build-referenced history', async () => {
    await database.engineProjectRevision.createMany({
      data: Array.from({ length: 104 }, (_, index) => ({
        projectId: ids.project,
        revisionNumber: index + 1,
        schemaVersion: 1,
        document: project(),
        contentHash: (index + 1).toString(16).padStart(64, '0'),
        byteSize: 100,
        retention: 'STANDARD' as const,
        authorId: 'owner-1',
      })),
    });
    await database.engineProject.update({
      where: { id: ids.project },
      data: { headRevisionNumber: 104 },
    });
    const protectedRevision =
      await database.engineProjectRevision.findUniqueOrThrow({
        where: {
          projectId_revisionNumber: {
            projectId: ids.project,
            revisionNumber: 1,
          },
        },
      });
    await database.gameBuild.create({
      data: {
        id: 'protected-build',
        gameId: 'game-1',
        engineRevisionId: protectedRevision.id,
        state: 'READY',
        runtimeFamily: 'TFG_ENGINE',
        runtimeVersion: '1',
        creatorId: 'owner-1',
      },
    });

    await repository.compactStandardRevisions(ids.project, 100);

    const remaining = await database.engineProjectRevision.findMany({
      where: { projectId: ids.project },
      orderBy: { revisionNumber: 'asc' },
      select: { revisionNumber: true },
    });
    expect(remaining).toHaveLength(102);
    expect(remaining.slice(0, 2)).toEqual([
      { revisionNumber: 0 },
      { revisionNumber: 1 },
    ]);
    expect(remaining[2]).toEqual({ revisionNumber: 5 });
    expect(remaining.at(-1)).toEqual({ revisionNumber: 104 });
  });
});
