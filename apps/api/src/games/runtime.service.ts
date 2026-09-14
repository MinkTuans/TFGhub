import { Inject, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { ObjectStorage } from './object-storage.js';
import { VersionsRepository } from './versions.repository.js';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
};

export type RuntimeFile = { body: Buffer; contentType: string };

function normalizeAssetPath(path: string): string | null {
  const trimmed = path.replace(/^\/+/, '').replace(/\\/g, '/');
  const parts = trimmed.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) return null;
  return parts.join('/') || 'index.html';
}

@Injectable()
export class RuntimeService {
  constructor(
    @Inject(VersionsRepository)
    private readonly versions: VersionsRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
  ) {}

  async serve(slug: string, assetPath: string): Promise<RuntimeFile | null> {
    const published = await this.versions.findPublishedRuntime(slug);
    if (!published) return null;
    const name = normalizeAssetPath(assetPath);
    if (!name) return null;
    const archive = await this.storage.get(published.storageKey);
    if (!archive) return null;
    const zip = await JSZip.loadAsync(archive);
    const entry =
      zip.file(name) ??
      (name === 'index.html'
        ? Object.values(zip.files).find(
            (file) => !file.dir && file.name.toLowerCase().endsWith('index.html'),
          )
        : undefined);
    if (!entry || entry.dir) return null;
    const body = Buffer.from(await entry.async('uint8array'));
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return { body, contentType: TYPES[ext] ?? 'application/octet-stream' };
  }
}
