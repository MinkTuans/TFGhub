import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from './object-storage.js';
import { RuntimeService } from './runtime.service.js';
import type { VersionsRepository } from './versions.service.js';

async function zipWith(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

function repo(
  published: { storageKey: string } | null,
): Pick<VersionsRepository, 'findPublishedRuntime'> {
  return {
    findPublishedRuntime: async () => published,
  };
}

describe('RuntimeService', () => {
  it('serves index.html from a published READY zip and nothing from a draft', async () => {
    const archive = await zipWith({
      'index.html': '<html><body>play</body></html>',
      'game.js': 'console.log(1)',
    });
    const storage = new MemoryObjectStorage();
    await storage.put('quarantine/game-1/ver-1/orbit.zip', archive);
    const service = new RuntimeService(
      repo({ storageKey: 'quarantine/game-1/ver-1/orbit.zip' }) as VersionsRepository,
      storage,
    );

    const page = await service.serve('orbit-orchard', 'index.html');
    expect(page?.contentType).toBe('text/html; charset=utf-8');
    expect(page?.body.toString()).toContain('play');

    const script = await service.serve('orbit-orchard', 'game.js');
    expect(script?.contentType).toBe('text/javascript; charset=utf-8');

    const hidden = new RuntimeService(repo(null) as VersionsRepository, storage);
    await expect(hidden.serve('secret-draft', 'index.html')).resolves.toBeNull();
  });

  it('rejects path traversal and missing files', async () => {
    const archive = await zipWith({ 'index.html': '<html></html>' });
    const storage = new MemoryObjectStorage();
    await storage.put('builds/orbit.zip', archive);
    const service = new RuntimeService(
      repo({ storageKey: 'builds/orbit.zip' }) as VersionsRepository,
      storage,
    );
    await expect(service.serve('orbit-orchard', '../secret.txt')).resolves.toBeNull();
    await expect(service.serve('orbit-orchard', 'missing.js')).resolves.toBeNull();
  });
});
