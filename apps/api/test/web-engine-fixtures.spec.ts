import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createSyntheticWebEngineFixture,
  validateSyntheticWebEngineFixture,
  type SyntheticEngineKind,
} from './web-engine-fixtures.js';

const kinds: SyntheticEngineKind[] = ['unity', 'godot'];

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('synthetic web-engine fixtures', () => {
  it.each(kinds)(
    'creates a self-validating deterministic %s fixture',
    async (kind) => {
      const fixture = await createSyntheticWebEngineFixture(kind);

      await expect(
        validateSyntheticWebEngineFixture(fixture),
      ).resolves.toBeUndefined();
      expect(fixture.manifest.fixtureType).toBe('synthetic');
      expect(fixture.manifest.engineVersion).toBe('synthetic');
      expect(fixture.manifest.label).toBe(
        kind === 'unity' ? 'synthetic-unity-webgl' : 'synthetic-godot-web',
      );
      expect(fixture.manifest.zipSha256).toBe(sha256(fixture.archive));
      expect(fixture.manifest.entries.map((entry) => entry.path)).toEqual(
        kind === 'unity'
          ? ['index.html', 'loader.js', 'runtime.wasm', 'Build/synthetic.data']
          : ['index.html', 'loader.js', 'runtime.wasm', 'synthetic.pck'],
      );
    },
  );

  it.each(kinds)('rejects a tampered %s archive', async (kind) => {
    const fixture = await createSyntheticWebEngineFixture(kind);
    const archive = Buffer.from(fixture.archive);
    archive[archive.length - 1] ^= 0xff;

    await expect(
      validateSyntheticWebEngineFixture({ ...fixture, archive }),
    ).rejects.toThrow();
  });

  it.each(kinds)(
    'rejects a tampered %s archive after its ZIP digest is refreshed',
    async (kind) => {
      const fixture = await createSyntheticWebEngineFixture(kind);
      const archive = Buffer.from(fixture.archive);
      archive[archive.length - 1] ^= 0xff;

      await expect(
        validateSyntheticWebEngineFixture({
          ...fixture,
          archive,
          manifest: { ...fixture.manifest, zipSha256: sha256(archive) },
        }),
      ).rejects.toThrow();
    },
  );

  it.each(kinds)('rejects a tampered %s manifest digest', async (kind) => {
    const fixture = await createSyntheticWebEngineFixture(kind);

    await expect(
      validateSyntheticWebEngineFixture({
        ...fixture,
        manifest: { ...fixture.manifest, zipSha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow();
  });

  it.each(kinds)(
    'rejects tampered %s manifest entry integrity fields',
    async (kind) => {
      const fixture = await createSyntheticWebEngineFixture(kind);
      const entries = fixture.manifest.entries.map((entry, index) =>
        index === 0 ? { ...entry, sha256: '0'.repeat(64) } : entry,
      );
      await expect(
        validateSyntheticWebEngineFixture({
          ...fixture,
          manifest: { ...fixture.manifest, entries },
        }),
      ).rejects.toThrow();

      const renamed = fixture.manifest.entries.map((entry, index) =>
        index === 0 ? { ...entry, path: 'tampered.html' } : entry,
      );
      await expect(
        validateSyntheticWebEngineFixture({
          ...fixture,
          manifest: { ...fixture.manifest, entries: renamed },
        }),
      ).rejects.toThrow();

      const mimeChanged = fixture.manifest.entries.map((entry, index) =>
        index === 0
          ? { ...entry, mimeType: 'application/octet-stream' }
          : entry,
      );
      await expect(
        validateSyntheticWebEngineFixture({
          ...fixture,
          manifest: { ...fixture.manifest, entries: mimeChanged },
        }),
      ).rejects.toThrow();
    },
  );
});
