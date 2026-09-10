import { database } from '@indieforge/database';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GameAssetsService } from '../src/game-assets/game-assets.service.js';
import { GameAssetsRepository } from '../src/game-assets/game-assets.repository.js';
import { AssetStorage } from '../src/game-assets/asset-storage.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const describeDatabase = process.env.GAME_ASSETS_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
function wav() {
  const bytes = Buffer.alloc(44 + 16000);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(16000, 40);
  return bytes;
}

describeDatabase(
  'immutable assets: real PostgreSQL, filesystem and sharp',
  () => {
    let app: INestApplication;
    let owner: ReturnType<typeof request.agent>;
    let other: ReturnType<typeof request.agent>;
    let ownerId: string;
    let ownerCookie: string;
    let otherId: string;
    let gameId: string;
    let projectId: string;
    let image: Buffer;
    const games: string[] = [];
    const base = () => `/games/${gameId}/assets`;
    const upload = (
      bytes = image,
      name = 'hero.png',
      mime = 'image/png',
      id = randomUUID(),
    ) =>
      owner
        .post(base())
        .field('uploadId', id)
        .field('category', 'CHARACTER')
        .attach('file', bytes, { filename: name, contentType: mime });
    beforeAll(async () => {
      expect(process.env.DATABASE_URL).toBe(
        process.env.GAME_ASSETS_TEST_DATABASE_URL,
      );
      expect(process.env.GAME_STORAGE_ROOT).toMatch(
        /^\/tmp\/tfg-task18-storage-/,
      );
      app = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      owner = request.agent(app.getHttpServer());
      other = request.agent(app.getHttpServer());
      for (const [agent, label] of [
        [owner, 'owner'],
        [other, 'other'],
      ] as const) {
        const email = `assets-${label}-${randomUUID()}@example.test`;
        const registered = await agent
          .post('/auth/register')
          .send({ email, password: 'password123' })
          .expect(201);
        const user = await database.user.findUniqueOrThrow({
          where: { email },
        });
        if (label === 'owner') {
          ownerId = user.id;
          ownerCookie = (
            registered.headers['set-cookie'] as unknown as string[]
          )
            .map((value) => value.split(';')[0])
            .join('; ');
        } else otherId = user.id;
      }
      image = await sharp({
        create: {
          width: 512,
          height: 256,
          channels: 4,
          background: { r: 240, g: 10, b: 20, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
    });
    beforeEach(async () => {
      const created = await owner
        .post('/games/engine-projects')
        .send({})
        .expect(201);
      gameId = created.body.game.id;
      projectId = created.body.project.project.projectId;
      games.push(gameId);
    });
    afterAll(async () => {
      await database.gameBuildAsset.deleteMany({
        where: { build: { gameId: { in: games } } },
      });
      await database.gameBuild.deleteMany({ where: { gameId: { in: games } } });
      await database.engineRevisionAsset.deleteMany({
        where: { revision: { project: { gameId: { in: games } } } },
      });
      await database.game.deleteMany({ where: { id: { in: games } } });
      await database.user.deleteMany({
        where: { id: { in: [ownerId, otherId].filter(Boolean) } },
      });
      await app?.close();
      await database.$disconnect();
    });

    it('uploads original bytes, validates real dimensions, persists metadata and reads a deterministic stripped thumbnail', async () => {
      const id = randomUUID();
      const response = await upload(image, 'hero.png', 'image/png', id).expect(
        201,
      );
      expect(response.body).toMatchObject({
        id,
        kind: 'IMAGE',
        state: 'READY',
        width: 512,
        height: 256,
        byteSize: image.length,
        contentHash: hash(image),
        metadata: { category: 'CHARACTER', image: { format: 'png' } },
      });
      expect(response.body.storageKey).toBeUndefined();
      const source = await owner.get(`${base()}/${id}/content`).expect(200);
      expect(source.body).toEqual(image);
      expect(source.headers['x-content-type-options']).toBe('nosniff');
      const thumb = await owner.get(`${base()}/${id}/thumbnail`).expect(200);
      expect(thumb.headers['content-type']).toMatch(/^image\/png/);
      expect(thumb.body.equals(image)).toBe(false);
      expect(await sharp(thumb.body).metadata()).toMatchObject({
        width: 256,
        height: 128,
        format: 'png',
      });
      expect((await sharp(thumb.body).metadata()).exif).toBeUndefined();
      const row = await database.gameAsset.findUniqueOrThrow({ where: { id } });
      expect(
        await readFile(`${process.env.GAME_STORAGE_ROOT}/${row.storageKey}`),
      ).toEqual(image);
      const second = await upload().expect(201);
      expect(
        (await owner.get(`${base()}/${second.body.id}/thumbnail`).expect(200))
          .body,
      ).toEqual(thumb.body);
      const blueSource = await sharp({
        create: { width: 512, height: 256, channels: 4, background: '#0000ff' },
      })
        .png()
        .toBuffer();
      const blue = (await upload(blueSource).expect(201)).body;
      const blueThumbnail = (
        await owner.get(`${base()}/${blue.id}/thumbnail`).expect(200)
      ).body;
      expect(blueThumbnail.equals(thumb.body)).toBe(false);
      expect(
        (await sharp(blueThumbnail).raw().toBuffer()).subarray(0, 4),
      ).toEqual(Buffer.from([0, 0, 255, 255]));
      const retry = await upload(image, 'hero.png', 'image/png', id).expect(
        201,
      );
      expect(retry.body).toEqual(response.body);
      await upload(
        await sharp(image).jpeg().toBuffer(),
        'hero.jpg',
        'image/jpeg',
        id,
      ).expect(409);
      expect((await owner.get(`${base()}/${id}/content`)).body).toEqual(image);
    });

    it('rejects unauthenticated and foreign requests before consuming an unfinished multipart body', async () => {
      const url = new URL(await app.getUrl());
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            path: base(),
            headers: {
              'Content-Type': 'multipart/form-data; boundary=unfinished',
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            resolve(res.statusCode!);
            res.resume();
            req.destroy();
          },
        );
        req.on('error', reject);
        req.setTimeout(3000, () =>
          req.destroy(new Error('Buffered before auth')),
        );
        req.write('--unfinished\r\n');
      });
      expect(status).toBe(401);
      await other
        .post(base())
        .set('Content-Type', 'multipart/form-data; boundary=bad')
        .send('not multipart')
        .expect(403);
      await owner
        .post(base())
        .set('Origin', 'https://foreign.test')
        .attach('file', image, 'hero.png')
        .expect(403);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(0);
    });

    it('rejects corrupted, unsupported and mismatched media and counts actual upload bytes', async () => {
      const cases: Array<[Buffer, string, string]> = [
        [image, 'hero.jpg', 'image/png'],
        [image, 'hero.png', 'image/jpeg'],
        [
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
          'hero.svg',
          'image/svg+xml',
        ],
        [Buffer.from('not an image'), 'hero.png', 'image/png'],
        [image.subarray(0, 40), 'hero.png', 'image/png'],
        [await sharp(image).gif().toBuffer(), 'hero.gif', 'image/gif'],
        [
          await sharp(image)
            .webp({ loop: 0 })
            .toBuffer()
            .then((b) => Buffer.concat([b.subarray(0, 20)])),
          'hero.webp',
          'image/webp',
        ],
      ];
      for (const [bytes, name, mime] of cases)
        await upload(bytes, name, mime).expect(400);
      await upload(
        Buffer.alloc(10 * 1024 * 1024 + 1),
        'hero.png',
        'image/png',
      ).expect(413);
      await upload(
        await sharp({
          create: { width: 8193, height: 1, channels: 3, background: 'red' },
        })
          .png()
          .toBuffer(),
      ).expect(400);
      await upload(
        await sharp({
          create: { width: 4097, height: 4096, channels: 3, background: 'red' },
        })
          .png()
          .toBuffer(),
      ).expect(400);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(0);
    });

    it('imports PCM16 WAV with real duration and rejects malformed RIFF/format/data boundaries', async () => {
      const audio = wav();
      const result = await upload(audio, 'sound.wav', 'audio/wav').expect(201);
      expect(result.body).toMatchObject({
        kind: 'AUDIO',
        durationMs: 1000,
        thumbnailUrl: null,
        metadata: {
          audio: { channels: 1, sampleRate: 8000, bitsPerSample: 16 },
        },
      });
      expect(
        (await owner.get(`${base()}/${result.body.id}/content`).expect(200))
          .body,
      ).toEqual(audio);
      await owner.get(`${base()}/${result.body.id}/thumbnail`).expect(404);
      const malformed = [
        audio.subarray(0, 40),
        Buffer.concat([audio, Buffer.from('<script>')]),
      ];
      for (const offset of [0, 8, 12, 36]) {
        const bad = Buffer.from(audio);
        bad[offset] |= 128;
        malformed.push(bad);
      }
      for (const [offset, value] of [
        [16, 0xffffffff],
        [20, 3],
        [22, 3],
        [24, 96000],
        [28, 123],
        [32, 4],
        [34, 8],
        [40, 0xffffffff],
      ]) {
        const bad = Buffer.from(audio);
        if ([20, 22, 32, 34].includes(offset)) bad.writeUInt16LE(value, offset);
        else bad.writeUInt32LE(value, offset);
        malformed.push(bad);
      }
      for (const bad of malformed)
        await upload(bad, 'sound.wav', 'audio/wav').expect(400);
    });

    it('lists with pagination/search/category/kind and updates only mutable presentation metadata', async () => {
      const one = (await upload().expect(201)).body;
      await upload(image, 'background.png').expect(201);
      await owner
        .patch(`${base()}/${one.id}`)
        .send({ displayName: 'Renamed Hero', category: 'NPC' })
        .expect(200);
      const list = await owner
        .get(`${base()}?search=hero&category=NPC&kind=IMAGE&limit=1`)
        .expect(200);
      expect(list.body.items.map((a: { id: string }) => a.id)).toEqual([
        one.id,
      ]);
      expect(list.body.total).toBe(1);
      await owner.get(`${base()}?limit=101`).expect(400);
      await owner
        .patch(`${base()}/${one.id}`)
        .send({ contentHash: 'b'.repeat(64) })
        .expect(400);
      const renamed = await database.gameAsset.findUniqueOrThrow({
        where: { id: one.id },
      });
      expect(renamed.contentHash).toBe(hash(image));
      expect((await owner.get(`${base()}/${one.id}/content`)).body).toEqual(
        image,
      );
      for (const method of ['get', 'patch', 'delete'] as const)
        await other[method](`${base()}/${one.id}`)
          .send(method === 'patch' ? { displayName: 'stolen' } : undefined)
          .expect(403);
      await other.get(base()).expect(403);
      await other.get(`${base()}/${one.id}/content`).expect(403);
    });

    it('tombstones without deleting bytes, blocks new/cross-project refs and prevents GC for revisions and builds', async () => {
      const asset = (await upload().expect(201)).body;
      const revision = await database.engineProjectRevision.findFirstOrThrow({
        where: { projectId },
      });
      await expect(
        database.engineRevisionAsset.create({
          data: {
            revisionId: revision.id,
            assetId: asset.id,
            contentHash: 'b'.repeat(64),
          },
        }),
      ).rejects.toThrow();
      await database.engineRevisionAsset.create({
        data: {
          revisionId: revision.id,
          assetId: asset.id,
          contentHash: asset.contentHash,
        },
      });
      const build = await database.gameBuild.create({
        data: {
          gameId,
          engineRevisionId: revision.id,
          runtimeFamily: 'test',
          runtimeVersion: '1',
          creatorId: ownerId,
        },
      });
      await database.gameBuildAsset.create({
        data: {
          buildId: build.id,
          assetId: asset.id,
          contentHash: asset.contentHash,
        },
      });
      await owner.delete(`${base()}/${asset.id}`).expect(200);
      expect(
        (await owner.get(`${base()}/${asset.id}/content`).expect(200)).body,
      ).toEqual(image);
      expect((await owner.get(base()).expect(200)).body.items).toEqual([]);
      expect(
        (await owner.get(`${base()}?state=TOMBSTONED`).expect(200)).body.items,
      ).toHaveLength(1);
      // Internal GC is intentionally not exposed to owner HTTP callers.
      await owner.post(`${base()}/${asset.id}/gc`).send({}).expect(404);
      const service = app.get(GameAssetsService);
      expect(await service.collectGarbage(asset.id)).toBe(false);
      await database.engineRevisionAsset.deleteMany({
        where: { assetId: asset.id },
      });
      expect(await service.collectGarbage(asset.id)).toBe(false);
      await expect(
        database.engineRevisionAsset.create({
          data: {
            revisionId: revision.id,
            assetId: asset.id,
            contentHash: asset.contentHash,
          },
        }),
      ).rejects.toThrow();
      await database.gameBuildAsset.deleteMany({
        where: { assetId: asset.id },
      });
      expect(await service.collectGarbage(asset.id)).toBe(true);
      await owner.get(`${base()}/${asset.id}/content`).expect(404);
      expect(
        (
          await database.gameAsset.findUniqueOrThrow({
            where: { id: asset.id },
          })
        ).state,
      ).toBe('GC_PENDING');
    });
    it('bounds actual chunked bytes without Content-Length and accepts the inclusive WAV byte limit', async () => {
      const url = new URL(await app.getUrl());
      const boundary = 'bounded-stream';
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            path: base(),
            headers: {
              Cookie: ownerCookie,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            resolve(res.statusCode!);
            res.resume();
          },
        );
        req.on('error', reject);
        req.write(
          `--${boundary}\r\nContent-Disposition: form-data; name="uploadId"\r\n\r\n${randomUUID()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n`,
        );
        req.write(Buffer.alloc(10 * 1024 * 1024 + 1));
        req.end(`\r\n--${boundary}--\r\n`);
      });
      expect(status).toBe(413);
      const audio = Buffer.alloc(10 * 1024 * 1024);
      wav().copy(audio, 0, 0, 44);
      audio.writeUInt32LE(audio.length - 8, 4);
      audio.writeUInt32LE(48000, 24);
      audio.writeUInt32LE(96000, 28);
      audio.writeUInt32LE(audio.length - 44, 40);
      expect(
        (await upload(audio, 'limit.wav', 'audio/wav').expect(201)).body
          .byteSize,
      ).toBe(10 * 1024 * 1024);
    });
    it('enforces WAV order, padding, duplicate chunks, sample alignment and duration limits', async () => {
      const original = wav();
      const junk = Buffer.from([74, 85, 78, 75, 1, 0, 0, 0, 42, 0]);
      const padded = Buffer.concat([
        original.subarray(0, 36),
        junk,
        original.subarray(36),
      ]);
      padded.writeUInt32LE(padded.length - 8, 4);
      await upload(padded, 'padded.wav', 'audio/wav').expect(201);
      const badPadding = Buffer.from(padded);
      badPadding[45] = 1;
      const reversed = Buffer.concat([
        original.subarray(0, 12),
        original.subarray(36),
        original.subarray(12, 36),
      ]);
      const duplicate = Buffer.concat([original, original.subarray(12, 36)]);
      duplicate.writeUInt32LE(duplicate.length - 8, 4);
      const overflow = Buffer.alloc(44 + 16000 * 301);
      original.copy(overflow, 0, 0, 44);
      overflow.writeUInt32LE(overflow.length - 8, 4);
      overflow.writeUInt32LE(overflow.length - 44, 40);
      for (const bad of [badPadding, reversed, duplicate, overflow])
        await upload(bad, 'bad.wav', 'audio/wav').expect(400);
    });
    it('keeps pre-metadata legacy FONT and OTHER records list/read compatible without enabling their upload', async () => {
      const directory = `${process.env.GAME_STORAGE_ROOT}/legacy-${projectId}`;
      await mkdir(directory);
      for (const kind of ['FONT', 'OTHER'] as const) {
        const bytes = Buffer.from(`legacy ${kind} bytes`);
        await writeFile(`${directory}/${kind}`, bytes);
        const row = await database.gameAsset.create({
          data: {
            id: randomUUID(),
            projectId,
            kind,
            displayName: kind,
            state: 'READY',
            storageKey: `legacy-${projectId}/${kind}`,
            contentHash: hash(bytes),
            mimeType: 'application/octet-stream',
            byteSize: bytes.length,
          },
        });
        const summary = (await owner.get(`${base()}/${row.id}`).expect(200))
          .body;
        expect(summary.metadata).toEqual({});
        expect(summary.thumbnailUrl).toBeNull();
        expect(
          (await owner.get(`${base()}/${row.id}/content`).expect(200)).body,
        ).toEqual(bytes);
        expect(
          (await owner.get(`${base()}?kind=${kind}`).expect(200)).body.items,
        ).toHaveLength(1);
        await owner.delete(`${base()}/${row.id}`).expect(200);
        expect(await app.get(GameAssetsService).collectGarbage(row.id)).toBe(
          false,
        );
        expect(
          (await owner.get(`${base()}/${row.id}/content`).expect(200)).body,
        ).toEqual(bytes);
      }
      await upload(Buffer.from('wOF2bad'), 'font.woff2', 'font/woff2').expect(
        400,
      );
    });
    afterEach(() => vi.restoreAllMocks());
    it('rejects crafted multipart field names and oversized array indexes without crashing', async () => {
      await owner
        .post(base())
        .field('items[4294967294]', 'x')
        .field('items[]', 'y')
        .timeout({ response: 2000, deadline: 3000 })
        .expect(400);
      await owner
        .post(base())
        .field('items[1000001]', 'x')
        .field('items[name]', 'y')
        .timeout({ response: 2000, deadline: 3000 })
        .expect(400);
      await owner.get(base()).expect(200);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(0);
    });
    it('cleans aborted multipart streams without retaining descriptors, reservations or files', async () => {
      const url = new URL(await app.getUrl());
      const descriptors = (await readdir('/proc/self/fd')).length;
      for (let index = 0; index < 24; index++) {
        await new Promise<void>((resolve) => {
          const req = httpRequest({
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            path: base(),
            headers: {
              Cookie: ownerCookie,
              Connection: 'close',
              'Content-Type': 'multipart/form-data; boundary=abort',
              'Transfer-Encoding': 'chunked',
            },
          });
          req.on('error', () => {});
          req.on('close', resolve);
          req.write(
            `--abort\r\nContent-Disposition: form-data; name="uploadId"\r\n\r\n${randomUUID()}\r\n--abort\r\nContent-Disposition: form-data; name="file"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n`,
          );
          req.write(Buffer.alloc(32768), () =>
            setTimeout(() => req.destroy(), 20),
          );
        });
      }
      await expect
        .poll(async () => (await readdir('/proc/self/fd')).length, {
          timeout: 3000,
        })
        .toBeLessThanOrEqual(descriptors + 4);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(0);
      await expect(
        readdir(`${process.env.GAME_STORAGE_ROOT}/project-assets/${projectId}`),
      ).rejects.toThrow();
      await upload().expect(201);
    });
    it('rechecks ownership after authentication while a multipart body is still streaming', async () => {
      const service = app.get(GameAssetsService);
      const owned = service.owned.bind(service);
      let entered!: () => void;
      const authenticated = new Promise<void>((resolve) => {
        entered = resolve;
      });
      vi.spyOn(service, 'owned').mockImplementationOnce(async (...args) => {
        const project = await owned(...args);
        entered();
        return project;
      });
      const url = new URL(await app.getUrl());
      const boundary = 'owner-change';
      let req!: ReturnType<typeof httpRequest>;
      const response = new Promise<number>((resolve, reject) => {
        req = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            path: base(),
            headers: {
              Cookie: ownerCookie,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            resolve(res.statusCode!);
            res.resume();
          },
        );
        req.on('error', reject);
        req.write(`--${boundary}\r\n`);
      });
      await authenticated;
      await database.game.update({
        where: { id: gameId },
        data: { ownerId: otherId },
      });
      req.write(
        `Content-Disposition: form-data; name="uploadId"\r\n\r\n${randomUUID()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n`,
      );
      req.write(image);
      req.end(`\r\n--${boundary}--\r\n`);
      expect(await response).toBe(403);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(0);
    });
    it('serializes reference insertion with tombstoning and GC claims under real PostgreSQL locks', async () => {
      const asset = (await upload().expect(201)).body;
      const revision = await database.engineProjectRevision.findFirstOrThrow({
        where: { projectId },
      });
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const insert = database.$transaction(async (tx) => {
        await tx.engineRevisionAsset.create({
          data: {
            revisionId: revision.id,
            assetId: asset.id,
            contentHash: asset.contentHash,
          },
        });
        entered();
        await gate;
      });
      await ready;
      const tombstoning = app
        .get(GameAssetsService)
        .tombstone(gameId, ownerId, asset.id);
      await expect
        .poll(
          async () =>
            Number(
              (
                await database.$queryRaw<
                  Array<{ count: bigint }>
                >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
              )[0].count,
            ),
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
      release();
      await insert;
      await tombstoning;
      expect(await app.get(GameAssetsService).collectGarbage(asset.id)).toBe(
        false,
      );
      expect(
        (await owner.get(`${base()}/${asset.id}/content`).expect(200)).body,
      ).toEqual(image);
    });
    it('resumes a durable GC claim after a failed physical cleanup', async () => {
      const asset = (await upload().expect(201)).body;
      await owner.delete(`${base()}/${asset.id}`).expect(200);
      const service = app.get(GameAssetsService);
      const storage = app.get(AssetStorage);
      vi.spyOn(storage, 'discardClaimed').mockRejectedValueOnce(
        new Error('Storage offline'),
      );
      await expect(service.collectGarbage(asset.id)).rejects.toThrow(
        'Storage offline',
      );
      const row = await database.gameAsset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      expect(row.state).toBe('GC_PENDING');
      expect(
        await readFile(`${process.env.GAME_STORAGE_ROOT}/${row.storageKey}`),
      ).toEqual(image);
      expect(await service.collectGarbage(asset.id)).toBe(true);
      await expect(
        readFile(`${process.env.GAME_STORAGE_ROOT}/${row.storageKey}`),
      ).rejects.toThrow();
      expect(await service.collectGarbage(asset.id)).toBe(true);
    });
    it('converges concurrent retries and a lost finalization response without changing the original', async () => {
      const id = randomUUID();
      const repository = app.get(GameAssetsRepository);
      const withOwner = repository.withOwner.bind(repository);
      let failReadyResponse = true;
      vi.spyOn(repository, 'withOwner').mockImplementation(async (...args) => {
        const result = await withOwner(...args);
        if (
          failReadyResponse &&
          result &&
          typeof result === 'object' &&
          'state' in result &&
          result.state === 'READY'
        ) {
          failReadyResponse = false;
          throw new Error('Lost committed response');
        }
        return result;
      });
      const results = await Promise.all([
        upload(image, 'hero.png', 'image/png', id).expect(201),
        upload(image, 'hero.png', 'image/png', id).expect(201),
      ]);
      expect(results[0].body).toEqual(results[1].body);
      expect(await database.gameAsset.count({ where: { projectId } })).toBe(1);
      expect(
        (await owner.get(`${base()}/${id}/content`).expect(200)).body,
      ).toEqual(image);
    });
    it('retains installed source after a failed DB finalization and safely reuses it on retry', async () => {
      const id = randomUUID();
      const repository = app.get(GameAssetsRepository);
      const withOwner = repository.withOwner.bind(repository);
      let failTransaction = true;
      vi.spyOn(repository, 'withOwner').mockImplementation(
        (game, user, operation) =>
          withOwner(game, user, async (...args) => {
            const result = await operation(...args);
            if (
              failTransaction &&
              result &&
              typeof result === 'object' &&
              'state' in result &&
              result.state === 'READY'
            ) {
              failTransaction = false;
              throw new Error('Rollback finalization');
            }
            return result;
          }),
      );
      await upload(image, 'hero.png', 'image/png', id).expect(503);
      const pending = await database.gameAsset.findUniqueOrThrow({
        where: { id },
      });
      expect(pending.state).toBe('UPLOADING');
      expect(
        await readFile(
          `${process.env.GAME_STORAGE_ROOT}/${pending.storageKey}`,
        ),
      ).toEqual(image);
      await owner.get(`${base()}/${id}/content`).expect(404);
      expect(await app.get(GameAssetsService).collectGarbage(id)).toBe(false);
      await upload(image, 'hero.png', 'image/png', id).expect(201);
      expect(
        (await owner.get(`${base()}/${id}/content`).expect(200)).body,
      ).toEqual(image);
    });
    it('rejects same-owner cross-project reads, upload identities and new references', async () => {
      const asset = (await upload().expect(201)).body;
      const created = await owner
        .post('/games/engine-projects')
        .send({})
        .expect(201);
      games.push(created.body.game.id);
      const foreignProject = created.body.project.project.projectId;
      const revision = await database.engineProjectRevision.findFirstOrThrow({
        where: { projectId: foreignProject },
      });
      const build = await database.gameBuild.create({
        data: {
          gameId: created.body.game.id,
          engineRevisionId: revision.id,
          runtimeFamily: 'test',
          runtimeVersion: '1',
          creatorId: ownerId,
        },
      });
      await expect(
        database.engineRevisionAsset.create({
          data: {
            assetId: asset.id,
            revisionId: revision.id,
            contentHash: asset.contentHash,
          },
        }),
      ).rejects.toThrow();
      await expect(
        database.gameBuildAsset.create({
          data: {
            assetId: asset.id,
            buildId: build.id,
            contentHash: asset.contentHash,
          },
        }),
      ).rejects.toThrow();
      await owner
        .get(`/games/${created.body.game.id}/assets/${asset.id}/content`)
        .expect(404);
      gameId = created.body.game.id;
      await upload(image, 'hero.png', 'image/png', asset.id).expect(409);
      await expect(
        database.gameAsset.update({
          where: { id: asset.id },
          data: { contentHash: 'c'.repeat(64) },
        }),
      ).rejects.toThrow();
    });
    it('waits for an in-flight content read before physically collecting tombstoned bytes', async () => {
      const asset = (await upload().expect(201)).body;
      await owner.delete(`${base()}/${asset.id}`).expect(200);
      const service = app.get(GameAssetsService);
      const storage = app.get(AssetStorage);
      const read = storage.read.bind(storage);
      let release!: () => void;
      let started!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.spyOn(storage, 'read').mockImplementationOnce(async (key) => {
        started();
        await gate;
        return read(key);
      });
      const reading = service.read(gameId, ownerId, asset.id, false);
      await entered;
      let collected = false;
      const collecting = service.collectGarbage(asset.id).then((result) => {
        collected = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const collectedDuringRead = collected;
      release();
      const results = await Promise.allSettled([reading, collecting]);
      expect(collectedDuringRead).toBe(false);
      expect(results[0]).toMatchObject({
        status: 'fulfilled',
        value: { content: image },
      });
      expect(results[1]).toEqual({ status: 'fulfilled', value: true });
    });
    it('validates extension on retried uploads and rejects unsafe filenames even with a separate display name', async () => {
      const id = randomUUID();
      await upload(image, 'hero.png', 'image/png', id).expect(201);
      await upload(image, 'hero.jpg', 'image/png', id).expect(400);
      await owner
        .post(base())
        .field('uploadId', randomUUID())
        .field('displayName', 'Friendly')
        .attach('file', image, {
          filename: '..\\evil.png',
          contentType: 'image/png',
        })
        .expect(400);
    });
  },
);
