import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareAsset } from './asset-types.js';

describe('asset media validation used by the lifecycle service', () => {
  afterEach(() => vi.restoreAllMocks());
  async function image() {
    return sharp({
      create: { width: 24, height: 12, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
  }
  it('rejects metadata failures without entering thumbnail processing', async () => {
    const buffer = await image();
    vi.spyOn(sharp.prototype, 'metadata').mockRejectedValueOnce(
      new Error('decoder failed'),
    );
    await expect(
      prepareAsset({
        buffer,
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toThrow('Invalid or unsupported media');
  });
  it('rejects pixel decode/processing failures after valid metadata', async () => {
    const buffer = await image();
    vi.spyOn(sharp.prototype, 'toBuffer').mockRejectedValueOnce(
      new Error('processing failed'),
    );
    await expect(
      prepareAsset({
        buffer,
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toThrow('Invalid or unsupported media');
  });
  it('rejects a real PNG with corrupted compressed pixels despite valid metadata', async () => {
    const buffer = await image();
    let offset = 8;
    while (buffer.toString('ascii', offset + 4, offset + 8) !== 'IDAT')
      offset += buffer.readUInt32BE(offset) + 12;
    buffer.fill(0, offset + 8, offset + 8 + buffer.readUInt32BE(offset));
    expect(await sharp(buffer).metadata()).toMatchObject({
      width: 24,
      height: 12,
    });
    await expect(
      prepareAsset({
        buffer,
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toThrow();
  });
  it('rejects animated images and appended image polyglots', async () => {
    const buffer = await image();
    await expect(
      prepareAsset({
        buffer: Buffer.concat([buffer, Buffer.from('<script>')]),
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toThrow();
    const animated = await sharp(
      [buffer, await sharp(buffer).negate().png().toBuffer()],
      { join: { animated: true } },
    )
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(
      prepareAsset({
        buffer: animated,
        originalname: 'image.webp',
        mimetype: 'image/webp',
      }),
    ).rejects.toThrow();
  });
  it('normalizes EXIF orientation/color for thumbnail only and strips metadata', async () => {
    const buffer = await sharp(await image())
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const before = Buffer.from(buffer);
    const prepared = await prepareAsset({
      buffer,
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
    });
    expect(prepared).toMatchObject({
      width: 24,
      height: 12,
      metadata: { image: { orientation: 6 } },
    });
    const thumbnail = await sharp(prepared.thumbnail!).metadata();
    expect(thumbnail).toMatchObject({
      width: 12,
      height: 24,
      space: 'srgb',
      format: 'png',
    });
    expect(thumbnail.exif).toBeUndefined();
    expect(thumbnail.icc).toBeUndefined();
    expect(buffer).toEqual(before);
  });
  it('rejects JPEG trailing polyglots even when another EOI marker is appended', async () => {
    const jpeg = await sharp(await image())
      .jpeg()
      .toBuffer();
    for (const suffix of [
      Buffer.from('<script>'),
      Buffer.concat([Buffer.from('<script>'), Buffer.from([255, 217])]),
      jpeg,
    ]) {
      await expect(
        prepareAsset({
          buffer: Buffer.concat([jpeg, suffix]),
          originalname: 'image.jpg',
          mimetype: 'image/jpeg',
        }),
      ).rejects.toThrow();
    }
    // Multi-scan progressive JPEG is still a supported static image.
    const progressive = await sharp(await image())
      .jpeg({ progressive: true })
      .toBuffer();
    expect(
      await prepareAsset({
        buffer: progressive,
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
      }),
    ).toMatchObject({ kind: 'IMAGE', width: 24, height: 12 });
  });
});
