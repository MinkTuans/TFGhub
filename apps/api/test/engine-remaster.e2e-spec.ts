import { database } from '@indieforge/database';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EngineBuildService } from '../src/games/engine-build.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
const enabled = process.env.ENGINE_REMASTER_TEST_DATABASE_URL
  ? describe
  : describe.skip;
enabled('Pixel Studio author/build/publish lifecycle', () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>;
  let ownerId: string, outsiderId: string, gameId: string;
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(
      process.env.ENGINE_REMASTER_TEST_DATABASE_URL,
    );
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const [client, label] of [
      [owner, 'owner'],
      [outsider, 'other'],
    ] as const) {
      const email = `pixel-${label}-${randomUUID()}@example.test`;
      await client
        .post('/auth/register')
        .send({ email, password: 'Password123!' })
        .expect(201);
      const user = await database.user.findUniqueOrThrow({ where: { email } });
      if (label === 'owner') ownerId = user.id;
      else outsiderId = user.id;
    }
  }, 30000);
  afterAll(async () => {
    if (gameId) await database.game.delete({ where: { id: gameId } });
    await database.user.deleteMany({
      where: { id: { in: [ownerId, outsiderId].filter(Boolean) } },
    });
    await app?.close();
    await database.$disconnect();
  });
  it('saves code, imports an image, builds owned immutable files, publishes and invalidates edited versions', async () => {
    const created = await owner
      .post('/games/engine-projects')
      .send({ title: 'Pixel integration', template: 'PIXEL_ADVENTURE' })
      .expect(201);
    gameId = created.body.game.id;
    const project = created.body.project.project;
    expect(project.scenes[0].objects.length).toBeGreaterThan(20);
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: '#ffcc00' },
    })
      .png()
      .toBuffer();
    const uploaded = await owner
      .post(`/games/${gameId}/assets`)
      .field('uploadId', randomUUID())
      .field('displayName', 'Imported pixel')
      .attach('file', png, { filename: 'pixel.png', contentType: 'image/png' })
      .expect(201);
    const asset = uploaded.body;
    const script = {
      ...project.scripts[0],
      source: 'api.showDialogue("Imported code works")',
    };
    const save = await owner
      .post(`/games/${gameId}/engine-project/mutations`)
      .send({
        baseRevision: 0,
        mutationId: randomUUID(),
        mutations: [
          { type: 'asset.declare', assetId: asset.id },
          { type: 'script.upsert', script },
        ],
      })
      .expect(201);
    expect(save.body.project.scripts[0].source).toContain('Imported code');
    await outsider.post(`/games/${gameId}/build`).send({}).expect(403);
    const built = await owner
      .post(`/games/${gameId}/build`)
      .send({})
      .expect(201);
    expect(built.body).toMatchObject({
      artifactReady: true,
      viewportWidth: 640,
      viewportHeight: 416,
    });
    const provenance = await database.gameBuild.findFirstOrThrow({
      where: { gameId },
      include: { engineRevision: true, assets: true },
    });
    expect(provenance.state).toBe('READY');
    expect(provenance.engineRevision?.revisionNumber).toBe(1);
    expect(provenance.assets.map((row) => row.assetId)).toContain(asset.id);
    const preview = await owner
      .get(`/games/${gameId}/preview/`)
      .redirects(2)
      .expect(200);
    expect(preview.text).toContain('<canvas');
    expect(preview.headers['content-security-policy']).toContain(
      'worker-src blob:',
    );
    const submission = await owner
      .post(`/games/${gameId}/submit`)
      .send({})
      .expect(201);
    await database.user.update({
      where: { id: ownerId },
      data: { role: 'ADMIN' },
    });
    const published = await owner
      .post(`/moderation/games/${gameId}/approve`)
      .send({
        submittedAt: submission.body.submittedAt,
        artifactVersion: built.body.artifactVersion,
      })
      .expect(201);
    expect(published.body.visibility).toBe('PUBLIC');
    const edited = await owner
      .post(`/games/${gameId}/engine-project/mutations`)
      .send({
        baseRevision: 1,
        mutationId: randomUUID(),
        mutations: [
          {
            type: 'scene.rename',
            sceneId: project.entrySceneId,
            name: 'Edited after publication',
          },
        ],
      })
      .expect(201);
    expect(edited.body.revision.revisionNumber).toBe(2);
    await owner.post(`/games/${gameId}/submit`).send({}).expect(409);
    expect(
      await database.game.findUnique({ where: { id: gameId } }),
    ).toMatchObject({ artifactReady: false, visibility: 'DRAFT' });
  }, 30000);
  it('rejects an advanced canonical head even if timestamps are equal', async () => {
    const builder = app.get(EngineBuildService);
    const prepare = builder.prepare.bind(builder);
    const original = await database.game.findUniqueOrThrow({
      where: { id: gameId },
    });
    const spy = vi
      .spyOn(builder, 'prepare')
      .mockImplementationOnce(async (...args) => {
        const result = await prepare(...args);
        const read = await owner
          .get(`/games/${gameId}/engine-project`)
          .expect(200);
        await owner
          .post(`/games/${gameId}/engine-project/mutations`)
          .send({
            baseRevision: read.body.revision.revisionNumber,
            mutationId: randomUUID(),
            mutations: [
              {
                type: 'scene.rename',
                sceneId: read.body.project.entrySceneId,
                name: 'Racing edit',
              },
            ],
          })
          .expect(201);
        await database.game.update({
          where: { id: gameId },
          data: { updatedAt: original.updatedAt },
        });
        return result;
      });
    try {
      await owner.post(`/games/${gameId}/build`).send({}).expect(409);
    } finally {
      spy.mockRestore();
    }
    expect(
      await database.game.findUnique({ where: { id: gameId } }),
    ).toMatchObject({
      artifactReady: false,
      artifactVersion: original.artifactVersion,
    });
  });
  it('rolls back artifact readiness if provenance cannot finalize', async () => {
    const builder = app.get(EngineBuildService);
    const prepare = builder.prepare.bind(builder);
    const original = await database.game.findUniqueOrThrow({
      where: { id: gameId },
    });
    const spy = vi
      .spyOn(builder, 'prepare')
      .mockImplementationOnce(async (...args) => {
        const result = await prepare(...args);
        await database.gameBuild.update({
          where: { id: result.buildId },
          data: { state: 'CANCELLED' },
        });
        return result;
      });
    try {
      await owner.post(`/games/${gameId}/build`).send({}).expect(503);
    } finally {
      spy.mockRestore();
    }
    expect(
      await database.game.findUnique({ where: { id: gameId } }),
    ).toMatchObject({
      artifactReady: false,
      artifactVersion: original.artifactVersion,
    });
  });
});
