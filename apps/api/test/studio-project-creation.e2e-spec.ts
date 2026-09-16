import { database } from '@indieforge/database';
import { EngineProjectV2 } from '@indieforge/engine-core';
import { EngineProjectReadResponse, GameSummary } from '@indieforge/contracts';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { GamesRepository, GamesService } from '../src/games/games.service.js';
import { EngineProjectsService } from '../src/engine-projects/engine-projects.service.js';

const describeDatabase = process.env.STUDIO_PROJECTS_TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeDatabase('atomic Studio draft creation on PostgreSQL', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let ownerId: string;
  let games: GamesRepository;

  beforeAll(async () => {
    // Use a dedicated database: the test runner's DATABASE_URL must match the opt-in URL.
    expect(process.env.DATABASE_URL).toBe(
      process.env.STUDIO_PROJECTS_TEST_DATABASE_URL,
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    games = app.get(GamesRepository);
    owner = request.agent(app.getHttpServer());
    const email = `studio-${randomUUID()}@example.test`;
    await owner
      .post('/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    ownerId = (await database.user.findUniqueOrThrow({ where: { email } })).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (ownerId) {
      await database.game.deleteMany({ where: { ownerId } });
      await database.user.delete({ where: { id: ownerId } });
    }
    await app?.close();
    await database.$disconnect();
  });

  it('creates an owned blank V2 revision zero, pinned and readable from its exact head', async () => {
    const response = await owner
      .post('/games/engine-projects')
      .send({ ownerId: 'attacker', sourceType: 'CODE', visibility: 'PUBLIC' })
      .expect(201);
    const game = GameSummary.parse(response.body.game);
    const project = EngineProjectReadResponse.parse(response.body.project);
    expect(game).toMatchObject({
      title: 'Game chưa có tên',
      sourceType: 'ENGINE',
      visibility: 'DRAFT',
      reviewState: 'DRAFT',
      moderationState: 'CLEAR',
      projectData: null,
      artifactReady: false,
      artifactVersion: 0,
    });
    expect(game.slug).toMatch(/^game-chua-co-ten-[a-z0-9-]+$/);
    expect(project.status).toBe('SUPPORTED');
    if (project.status !== 'SUPPORTED')
      throw new Error('Expected a supported project');
    const document = EngineProjectV2.parse(project.project);
    expect(document.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(document).toMatchObject({
      assetIds: [],
      prefabs: [],
      events: [],
      modules: [],
      scripts: [],
      variables: { global: [], player: [], scene: {} },
    });
    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0].id).toBe(document.entrySceneId);
    expect(document.scenes[0].objects).toEqual([]);
    const persisted = await database.game.findUniqueOrThrow({
      where: { id: game.id },
      include: { engineProject: { include: { revisions: true } } },
    });
    expect(persisted.ownerId).toBe(ownerId);
    expect(persisted.projectData).toBeNull();
    expect(persisted.engineProject).toMatchObject({
      id: document.projectId,
      headRevisionNumber: 0,
    });
    expect(persisted.engineProject!.revisions).toHaveLength(1);
    const revision = persisted.engineProject!.revisions[0];
    expect(revision).toMatchObject({
      revisionNumber: 0,
      schemaVersion: 2,
      retention: 'PINNED',
      authorId: ownerId,
      document: project.project,
    });
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, child]) => [key, canonical(child)]),
            )
          : value;
    const bytes = JSON.stringify(canonical(revision.document));
    expect(revision.contentHash).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(revision.byteSize).toBe(BigInt(Buffer.byteLength(bytes)));
    expect(project.revision).toMatchObject({
      revisionNumber: 0,
      schemaVersion: 2,
      retention: 'PINNED',
      contentHash: revision.contentHash,
      byteSize: Number(revision.byteSize),
    });
    await owner
      .get(`/games/${game.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(game.id));
    await owner
      .get(`/games/${game.id}/engine-project`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual(project));
    await expect(
      app.get(EngineProjectsService).read(game.id, 'other-owner'),
    ).rejects.toThrow('You do not own this game');
    await owner
      .get('/games/mine')
      .expect(200)
      .expect(({ body }) =>
        expect(body.some((item: { id: string }) => item.id === game.id)).toBe(
          true,
        ),
      );
  });

  it('rejects unauthenticated and invalid-title commands before any Game is written', async () => {
    const before = await database.game.count({ where: { ownerId } });
    await request(app.getHttpServer())
      .post('/games/engine-projects')
      .send({})
      .expect(401);
    for (const title of ['', '   ', 'a'.repeat(81), null]) {
      await owner.post('/games/engine-projects').send({ title }).expect(400);
    }
    expect(await database.game.count({ where: { ownerId } })).toBe(before);
  });

  it('retries real unique-slug violations between concurrent commands without partial drafts', async () => {
    const before = await database.game.count({ where: { ownerId } });
    expect(games.createEngineProject).toBeTypeOf('function');
    const create = games.createEngineProject.bind(games);
    let attempts = 0;
    const collisionSlug = `game-chua-co-ten-${randomUUID()}`;
    const intercept = vi
      .spyOn(games, 'createEngineProject')
      .mockImplementation((input) => {
        // Force three independent transactions to compete for the same unique slug.
        return create({
          ...input,
          slug: ++attempts <= 3 ? collisionSlug : input.slug,
        });
      });
    try {
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          owner
            .post('/games/engine-projects')
            .send({ title: '  Same title  ' })
            .expect(201),
        ),
      );
      expect(new Set(responses.map(({ body }) => body.game.slug)).size).toBe(3);
      expect(
        new Set(responses.map(({ body }) => body.project.project.projectId))
          .size,
      ).toBe(3);
      expect(
        responses.every(({ body }) => body.game.title === 'Same title'),
      ).toBe(true);
      expect(attempts).toBe(5);
      expect(await database.game.count({ where: { ownerId } })).toBe(
        before + 3,
      );
      expect(
        await database.engineProject.count({ where: { game: { ownerId } } }),
      ).toBe(before + 3);
    } finally {
      intercept.mockRestore();
    }
  });

  it('rolls back Game and EngineProject after a database revision insertion failure', async () => {
    const beforeGames = await database.game.count({ where: { ownerId } });
    const beforeProjects = await database.engineProject.count({
      where: { game: { ownerId } },
    });
    await database.$executeRawUnsafe(
      `CREATE FUNCTION task9_fail_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected revision failure'; END; $$`,
    );
    await database.$executeRawUnsafe(
      `CREATE TRIGGER task9_fail_revision BEFORE INSERT ON "EngineProjectRevision" FOR EACH ROW EXECUTE FUNCTION task9_fail_revision()`,
    );
    try {
      const service = app.get(GamesService);
      expect(service.createEngineProject).toBeTypeOf('function');
      await expect(
        service.createEngineProject(ownerId, { title: 'Rollback draft' }),
      ).rejects.toThrow('Injected revision failure');
      expect(await database.game.count({ where: { ownerId } })).toBe(
        beforeGames,
      );
      expect(
        await database.engineProject.count({ where: { game: { ownerId } } }),
      ).toBe(beforeProjects);
    } finally {
      await database.$executeRawUnsafe(
        'DROP TRIGGER task9_fail_revision ON "EngineProjectRevision"',
      );
      await database.$executeRawUnsafe('DROP FUNCTION task9_fail_revision()');
    }
  });

  it.each(['UPLOAD', 'CODE', 'STORY', 'PLATFORMER'])(
    'keeps the legacy %s create API and owner workspace',
    async (sourceType) => {
      const response = await owner
        .post('/games')
        .send({
          title: 'Legacy draft',
          slug: `legacy-${randomUUID()}`,
          sourceType,
        })
        .expect(201);
      expect(response.body.sourceType).toBe(sourceType);
      await owner
        .get(`/games/${response.body.id}`)
        .expect(200)
        .expect(({ body }) => expect(body.sourceType).toBe(sourceType));
      expect(
        await database.engineProject.findUnique({
          where: { gameId: response.body.id },
        }),
      ).toBeNull();
    },
  );
});
