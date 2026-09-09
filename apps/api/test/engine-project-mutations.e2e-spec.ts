import { database } from '@indieforge/database';
import {
  EngineProjectReadResponse,
  type ApplyMutationBatchInput,
} from '@indieforge/contracts';
import {
  EngineProjectV2,
  type EngineProjectV2Type,
} from '@indieforge/engine-core';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { EngineProjectsRepository } from '../src/engine-projects/engine-projects.repository.js';
import { EngineProjectsService } from '../src/engine-projects/engine-projects.service.js';

const describeDatabase = process.env.ENGINE_PROJECT_MUTATIONS_TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeDatabase('mutation batches on PostgreSQL', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let ownerId: string;
  let otherId: string;
  let gameId: string;
  let project: EngineProjectV2Type;
  const gameIds: string[] = [];

  const endpoint = () => `/games/${gameId}/engine-project/mutations`;
  const batch = (
    name = 'Renamed',
    baseRevision = 0,
    mutationId: string = randomUUID(),
  ): ApplyMutationBatchInput => ({
    baseRevision,
    mutationId,
    mutations: [{ type: 'scene.rename', sceneId: project.entrySceneId, name }],
  });
  const stored = () =>
    database.engineProject.findUniqueOrThrow({
      where: { id: project.projectId },
      include: {
        revisions: { orderBy: { revisionNumber: 'asc' } },
        mutations: true,
      },
    });
  async function expectUnchanged() {
    const state = await stored();
    expect(state.headRevisionNumber).toBe(0);
    expect(state.revisions).toHaveLength(1);
    expect(state.mutations).toHaveLength(0);
    expect(
      await database.engineRevisionAsset.count({
        where: { revision: { projectId: project.projectId } },
      }),
    ).toBe(0);
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(
      process.env.ENGINE_PROJECT_MUTATIONS_TEST_DATABASE_URL,
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    other = request.agent(app.getHttpServer());
    const emails = [
      `mutations-${randomUUID()}@example.test`,
      `mutations-other-${randomUUID()}@example.test`,
    ];
    await owner
      .post('/auth/register')
      .send({ email: emails[0], password: 'password123' })
      .expect(201);
    await other
      .post('/auth/register')
      .send({ email: emails[1], password: 'password123' })
      .expect(201);
    ownerId = (
      await database.user.findUniqueOrThrow({ where: { email: emails[0] } })
    ).id;
    otherId = (
      await database.user.findUniqueOrThrow({ where: { email: emails[1] } })
    ).id;
  });

  beforeEach(async () => {
    const created = await owner
      .post('/games/engine-projects')
      .send({})
      .expect(201);
    gameId = created.body.game.id;
    gameIds.push(gameId);
    project = EngineProjectV2.parse(created.body.project.project);
  });

  afterAll(async () => {
    await database.game.deleteMany({ where: { id: { in: gameIds } } });
    await database.user.deleteMany({
      where: { id: { in: [ownerId, otherId].filter(Boolean) } },
    });
    await app?.close();
    await database.$disconnect();
  });

  it('commits one immutable authoritative revision and idempotency row for an ordered batch', async () => {
    const input = batch('First');
    input.mutations.push({ ...input.mutations[0], name: '  Final  ' });
    const response = await owner.post(endpoint()).send(input).expect(201);
    const read = EngineProjectReadResponse.parse(response.body);
    expect(read).toMatchObject({
      status: 'SUPPORTED',
      revision: { revisionNumber: 1, schemaVersion: 2, retention: 'STANDARD' },
    });
    const state = await stored();
    const revision = state.revisions[1]!;
    expect(state.headRevisionNumber).toBe(1);
    expect(state.revisions).toHaveLength(2);
    expect(state.revisions[0]!.document).toEqual(project);
    expect(state.mutations).toHaveLength(1);
    expect(state.mutations[0]).toMatchObject({
      projectId: project.projectId,
      mutationId: input.mutationId,
      baseRevisionNumber: 0,
      resultRevisionNumber: 1,
    });
    const expected = structuredClone(project);
    expected.scenes[0]!.name = 'Final';
    expect(revision.document).toEqual(expected);
    expect(response.body.project).toEqual(revision.document);
    expect(response.body.revision).toEqual({
      revisionNumber: 1,
      schemaVersion: 2,
      contentHash: revision.contentHash,
      byteSize: Number(revision.byteSize),
      retention: 'STANDARD',
      createdAt: revision.createdAt.toISOString(),
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
    const bytes = JSON.stringify(canonical(expected));
    expect(revision.contentHash).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(revision.byteSize).toBe(BigInt(Buffer.byteLength(bytes)));
    await owner
      .get(`/games/${gameId}/engine-project`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual(response.body));
    expect(
      (await database.game.findUniqueOrThrow({ where: { id: gameId } }))
        .projectData,
    ).toBeNull();
  });

  it('allows exactly one concurrent writer at a base revision and returns a machine-readable conflict', async () => {
    const responses = await Promise.all([
      owner.post(endpoint()).send(batch('One')),
      owner.post(endpoint()).send(batch('Two')),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)!.body).toEqual({
      statusCode: 409,
      code: 'PROJECT_REVISION_CONFLICT',
      currentRevision: 1,
    });
    const state = await stored();
    expect(state.headRevisionNumber).toBe(1);
    expect(state.revisions).toHaveLength(2);
    expect(state.mutations).toHaveLength(1);
    expect(state.revisions[1]!.document).toEqual(
      responses.find(({ status }) => status === 201)!.body.project,
    );
  });

  it('replays the exact original result for concurrent duplicates and after later writes, even with changed payload', async () => {
    const input = batch('Original');
    const responses = await Promise.all([
      owner.post(endpoint()).send(input).expect(201),
      owner.post(endpoint()).send(input).expect(201),
    ]);
    expect(responses[0].body).toEqual(responses[1].body);
    await owner.post(endpoint()).send(batch('Later', 1)).expect(201);
    const replay = await owner
      .post(endpoint())
      .send({
        ...batch('Ignored', 99, input.mutationId),
        mutations: [{ ...input.mutations[0], sceneId: randomUUID() }],
      })
      .expect(201);
    expect(replay.body).toEqual(responses[0].body);
    const state = await stored();
    expect(state.headRevisionNumber).toBe(2);
    expect(state.revisions).toHaveLength(3);
    expect(state.mutations).toHaveLength(2);
  });

  it('requires authentication and ownership for both first delivery and replay', async () => {
    const input = batch();
    await request(app.getHttpServer()).post(endpoint()).send(input).expect(401);
    await other.post(endpoint()).send(input).expect(403);
    await expectUnchanged();
    await owner.post(endpoint()).send(input).expect(201);
    await other.post(endpoint()).send(input).expect(403);
    expect((await stored()).mutations).toHaveLength(1);
  });

  it('rechecks ownership after waiting for a real PostgreSQL Game row lock', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const transfer = database.$transaction(
      async (tx) => {
        await tx.game.update({
          where: { id: gameId },
          data: { ownerId: otherId },
        });
        locked();
        await release;
      },
      { timeout: 10_000 },
    );
    await ready;
    const pending = owner
      .post(endpoint())
      .send(batch())
      .then((response) => response);
    try {
      await expect
        .poll(
          async () => {
            const rows = await database.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%SELECT "sourceType" FROM "Game"%'
        `;
            return Number(rows[0]!.count);
          },
          { timeout: 3_000, interval: 10 },
        )
        .toBeGreaterThan(0);
    } finally {
      unlock();
      await transfer;
    }
    expect((await pending).status).toBe(403);
    await expectUnchanged();
  });

  it('rejects malformed input, missing targets, and semantically invalid documents atomically', async () => {
    for (const input of [
      { ...batch(), mutations: [] },
      { ...batch(), baseRevision: -1 },
      {
        ...batch(),
        mutations: [{ type: 'object.delete', objectId: randomUUID() }],
      },
    ]) {
      await owner.post(endpoint()).send(input).expect(400);
    }
    const missing = batch('Earlier');
    missing.mutations.push({ ...missing.mutations[0], sceneId: randomUUID() });
    await owner.post(endpoint()).send(missing).expect(400);
    await expectUnchanged();
    await database.engineProjectRevision.update({
      where: {
        projectId_revisionNumber: {
          projectId: project.projectId,
          revisionNumber: 0,
        },
      },
      data: { document: { ...project, entrySceneId: randomUUID() } },
    });
    await owner.post(endpoint()).send(batch()).expect(400);
    await expectUnchanged();
  });

  it('rolls back references, head, revision and idempotency row for an unavailable asset, then accepts retry', async () => {
    const assetId = randomUUID();
    project.assetIds = [assetId];
    await database.engineProjectRevision.update({
      where: {
        projectId_revisionNumber: {
          projectId: project.projectId,
          revisionNumber: 0,
        },
      },
      data: { document: project },
    });
    const input = batch();
    await owner.post(endpoint()).send(input).expect(400);
    await expectUnchanged();
    await database.gameAsset.create({
      data: {
        id: assetId,
        projectId: project.projectId,
        kind: 'IMAGE',
        displayName: 'Ready asset',
        state: 'READY',
        storageKey: `task10/${assetId}`,
        contentHash: 'b'.repeat(64),
        mimeType: 'image/png',
        byteSize: 10,
      },
    });
    await owner.post(endpoint()).send(input).expect(201);
    const state = await stored();
    expect(state.mutations).toHaveLength(1);
    expect(
      await database.engineRevisionAsset.findMany({
        where: { revisionId: state.revisions[1]!.id },
      }),
    ).toEqual([
      {
        revisionId: state.revisions[1]!.id,
        assetId,
        contentHash: 'b'.repeat(64),
      },
    ]);
    // Explicitly remove this fixture's references before its asset for scoped cleanup.
    await database.engineRevisionAsset.deleteMany({ where: { assetId } });
    await database.gameAsset.delete({ where: { id: assetId } });
  });

  it('rolls back a transaction if insertion of the idempotency record fails', async () => {
    const input = batch();
    const tables = await database.$queryRaw<
      Array<{ table: string | null }>
    >`SELECT to_regclass('"EngineProjectMutation"')::text AS "table"`;
    expect(tables[0]!.table).not.toBeNull();
    await database.$executeRawUnsafe(
      `CREATE FUNCTION task10_fail_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected mutation failure'; END; $$`,
    );
    await database.$executeRawUnsafe(
      `CREATE TRIGGER task10_fail_mutation BEFORE INSERT ON "EngineProjectMutation" FOR EACH ROW EXECUTE FUNCTION task10_fail_mutation()`,
    );
    try {
      await expect(
        app
          .get(EngineProjectsService)
          .applyMutationBatch(gameId, ownerId, input),
      ).rejects.toThrow('Injected mutation failure');
      await expectUnchanged();
    } finally {
      await database.$executeRawUnsafe(
        'DROP TRIGGER task10_fail_mutation ON "EngineProjectMutation"',
      );
      await database.$executeRawUnsafe('DROP FUNCTION task10_fail_mutation()');
    }
    await owner.post(endpoint()).send(input).expect(201);
    expect((await stored()).revisions).toHaveLength(2);
  });

  it('retains authoritative replay across compaction and enforces revision relation constraints', async () => {
    const input = batch('Retained');
    const first = await owner.post(endpoint()).send(input).expect(201);
    const revision = (await stored()).revisions[1]!;
    await database.engineProjectRevision.createMany({
      data: Array.from({ length: 102 }, (_, index) => ({
        projectId: project.projectId,
        revisionNumber: index + 2,
        schemaVersion: 2,
        document: project,
        contentHash: 'a'.repeat(64),
        byteSize: 100,
        retention: 'STANDARD',
        authorId: ownerId,
      })),
    });
    await database.engineProject.update({
      where: { id: project.projectId },
      data: { headRevisionNumber: 103 },
    });
    await app
      .get(EngineProjectsRepository)
      .compactStandardRevisions(project.projectId, 100);
    const state = await stored();
    expect(state.revisions).toHaveLength(102);
    expect(
      state.revisions.slice(0, 3).map(({ revisionNumber }) => revisionNumber),
    ).toEqual([0, 1, 4]);
    await expect(
      database.engineProjectRevision.delete({ where: { id: revision.id } }),
    ).rejects.toThrow();
    await expect(
      database.engineProjectMutation.create({
        data: {
          projectId: project.projectId,
          mutationId: randomUUID(),
          baseRevisionNumber: 999,
          resultRevisionNumber: 1000,
        },
      }),
    ).rejects.toThrow();
    await expect(
      database.engineProjectMutation.create({
        data: {
          projectId: project.projectId,
          mutationId: randomUUID(),
          baseRevisionNumber: -1,
          resultRevisionNumber: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(
      database.engineProjectMutation.create({
        data: {
          projectId: project.projectId,
          mutationId: randomUUID(),
          baseRevisionNumber: 0,
          resultRevisionNumber: 4,
        },
      }),
    ).rejects.toThrow();
    const replay = await owner.post(endpoint()).send(input).expect(201);
    expect(replay.body).toEqual(first.body);
    expect((await stored()).headRevisionNumber).toBe(103);
  });

  it('keeps idempotency IDs scoped to each project', async () => {
    const input = batch('One');
    await owner.post(endpoint()).send(input).expect(201);
    const created = await owner
      .post('/games/engine-projects')
      .send({})
      .expect(201);
    gameId = created.body.game.id;
    gameIds.push(gameId);
    project = EngineProjectV2.parse(created.body.project.project);
    const second = await owner
      .post(endpoint())
      .send(batch('Two', 0, input.mutationId))
      .expect(201);
    expect(second.body.project.projectId).toBe(project.projectId);
    expect(second.body.project.scenes[0].name).toBe('Two');
  });
});
