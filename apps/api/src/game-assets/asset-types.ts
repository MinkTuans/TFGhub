import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { AssetImportMetadata } from '@indieforge/contracts';
import sharp from 'sharp';

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 16777216;
// Changing the decoder or any option requires a new immutable recipe identifier.
export const THUMBNAIL_RECIPE = 'sharp-0_35_4-v1-inside256-lanczos3-srgb-png';
export type AssetUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};
export type PreparedAsset = {
  kind: 'IMAGE' | 'AUDIO';
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  metadata: AssetImportMetadata;
  thumbnail?: Buffer;
};
export const assetHash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const invalid = () => new BadRequestException('Invalid or unsupported media');

function validateJpegBoundary(bytes: Buffer) {
  let offset = 2;
  let inScan = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (inScan) {
      while (offset < bytes.length && bytes[offset] !== 255) offset++;
    }
    if (bytes[offset++] !== 255) throw invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    // Escaped entropy bytes and restart markers are not segment boundaries.
    if (inScan && (marker === 0 || (marker >= 208 && marker <= 215))) continue;
    if (marker === 217) {
      if (!sawScan || offset !== bytes.length) throw invalid();
      return;
    }
    if (
      marker === undefined ||
      marker === 0 ||
      (marker >= 208 && marker <= 216)
    )
      throw invalid();
    if (marker === 1) continue; // Standalone TEM marker has no length.
    if (offset + 2 > bytes.length) throw invalid();
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || size > bytes.length - offset) throw invalid();
    offset += size;
    inScan = marker === 218;
    sawScan ||= inScan;
  }
  throw invalid();
}

function imageContainer(bytes: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    let offset = 8;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString('latin1', offset + 4, offset + 8);
      if (size > bytes.length - offset - 12 || type === 'acTL') throw invalid();
      offset += 12 + size;
      if (type === 'IEND') {
        if (size !== 0) throw invalid();
        ended = true;
        break;
      }
    }
    if (!ended || offset !== bytes.length) throw invalid();
    return 'png';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) {
    validateJpegBoundary(bytes);
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    if (bytes.readUInt32LE(4) !== bytes.length - 8) throw invalid();
    return 'webp';
  }
  return null;
}

function parseWav(bytes: Buffer): PreparedAsset {
  if (
    bytes.length < 44 ||
    bytes.toString('latin1', 0, 4) !== 'RIFF' ||
    bytes.toString('latin1', 8, 12) !== 'WAVE' ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  )
    throw invalid();
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let dataSize = 0;
  let hasFormat = false;
  let hasData = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalid();
    const type = bytes.toString('latin1', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (
      size > bytes.length - offset ||
      offset + size + (size % 2) > bytes.length
    )
      throw invalid();
    if (type === 'fmt ') {
      if (
        hasFormat ||
        hasData ||
        ![16, 18].includes(size) ||
        (size === 18 && bytes.readUInt16LE(offset + 16) !== 0)
      )
        throw invalid();
      channels = bytes.readUInt16LE(offset + 2);
      sampleRate = bytes.readUInt32LE(offset + 4);
      byteRate = bytes.readUInt32LE(offset + 8);
      if (
        bytes.readUInt16LE(offset) !== 1 ||
        ![1, 2].includes(channels) ||
        sampleRate < 8000 ||
        sampleRate > 48000 ||
        bytes.readUInt16LE(offset + 14) !== 16 ||
        bytes.readUInt16LE(offset + 12) !== channels * 2 ||
        byteRate !== sampleRate * channels * 2
      )
        throw invalid();
      hasFormat = true;
    } else if (type === 'data') {
      if (!hasFormat || hasData || size === 0 || size % (channels * 2) !== 0)
        throw invalid();
      hasData = true;
      dataSize = size;
    } else if (type !== 'JUNK') throw invalid();
    if (size % 2 && bytes[offset + size] !== 0) throw invalid();
    offset += size + (size % 2);
  }
  if (!hasData || dataSize / byteRate > 300) throw invalid();
  return {
    kind: 'AUDIO',
    mimeType: 'audio/wav',
    width: null,
    height: null,
    durationMs: Math.ceil((dataSize * 1000) / byteRate),
    metadata: { audio: { channels, sampleRate, bitsPerSample: 16 } },
  };
}

export async function prepareAsset(file: AssetUpload): Promise<PreparedAsset> {
  if (file.buffer.length > MAX_ASSET_BYTES)
    throw new PayloadTooLargeException('Asset exceeds 10 MiB');
  if (!file.buffer.length) throw invalid();
  const extension = extname(file.originalname).toLowerCase();
  if (extension === '.wav' && file.mimetype === 'audio/wav')
    return parseWav(file.buffer);
  const format = imageContainer(file.buffer);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  if (
    !format ||
    file.mimetype !== mimeType ||
    !(format === 'jpeg' ? ['.jpg', '.jpeg'] : [`.${format}`]).includes(
      extension,
    )
  )
    throw invalid();
  try {
    const options = {
      failOn: 'warning' as const,
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
      unlimited: false,
      pages: 1,
    };
    const metadata = await sharp(file.buffer, options).metadata();
    const { width, height } = metadata;
    if (
      metadata.format !== format ||
      !width ||
      !height ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalid();
    const { data: thumbnail, info } = await sharp(file.buffer, options)
      .autoOrient()
      .resize({
        width: 256,
        height: 256,
        fit: 'inside',
        kernel: 'lanczos3',
        withoutEnlargement: true,
        fastShrinkOnLoad: false,
      })
      .toColourspace('srgb')
      .png({
        compressionLevel: 9,
        adaptiveFiltering: false,
        palette: false,
        progressive: false,
        force: true,
      })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    return {
      kind: 'IMAGE',
      mimeType,
      width,
      height,
      durationMs: null,
      thumbnail,
      metadata: {
        image: {
          format,
          orientation: metadata.orientation ?? 1,
          colorSpace: metadata.space,
        },
        thumbnail: {
          recipe: THUMBNAIL_RECIPE,
          contentHash: assetHash(thumbnail),
          width: info.width,
          height: info.height,
        },
      },
    };
  } catch {
    throw invalid();
  }
}
