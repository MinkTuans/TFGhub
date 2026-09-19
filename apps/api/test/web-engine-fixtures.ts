import { createHash } from 'node:crypto';

import yauzl from 'yauzl';

import { zipFixture } from './zip-fixture.js';

export type SyntheticEngineKind = 'unity' | 'godot';

export interface SyntheticWebEngineEntry {
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface SyntheticWebEngineManifest {
  fixtureType: 'synthetic';
  engineVersion: 'synthetic';
  label: 'synthetic-unity-webgl' | 'synthetic-godot-web';
  entries: SyntheticWebEngineEntry[];
  zipSha256: string;
}

export interface SyntheticWebEngineFixture {
  archive: Buffer;
  manifest: SyntheticWebEngineManifest;
}

const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const mimeByPath: Record<string, string> = {
  'index.html': 'text/html',
  'loader.js': 'application/javascript',
  'runtime.wasm': 'application/wasm',
  'Build/synthetic.data': 'application/octet-stream',
  'synthetic.pck': 'application/octet-stream',
};

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function labelFor(
  kind: SyntheticEngineKind,
): SyntheticWebEngineManifest['label'] {
  return kind === 'unity' ? 'synthetic-unity-webgl' : 'synthetic-godot-web';
}

function entriesFor(
  kind: SyntheticEngineKind,
): Array<{ path: string; content: Buffer }> {
  const label = labelFor(kind);
  const html = Buffer.from(
    `<!doctype html><html><body><canvas id="canvas" width="320" height="180"></canvas><div data-testid="synthetic-ready">ready</div><script src="loader.js"></script></body></html>`,
  );
  const loader = Buffer.from(
    `(() => { const c = document.querySelector('canvas'); const x = c.getContext('2d'); x.fillStyle = '#18a0ae'; x.fillRect(0, 0, c.width, c.height); document.body.dataset.fixture = '${label}'; addEventListener('keydown', e => { x.fillStyle = '#f2c94c'; x.fillRect(4, 4, 12, 12); }); addEventListener('pointerdown', e => { x.fillStyle = '#eb5757'; x.fillRect(e.offsetX, e.offsetY, 8, 8); }); })();`,
  );
  const payload = Buffer.from(`synthetic-${kind}-payload`);
  return [
    { path: 'index.html', content: html },
    { path: 'loader.js', content: loader },
    { path: 'runtime.wasm', content: wasm },
    {
      path: kind === 'unity' ? 'Build/synthetic.data' : 'synthetic.pck',
      content: payload,
    },
  ];
}

async function buildOnce(
  kind: SyntheticEngineKind,
): Promise<SyntheticWebEngineFixture> {
  const sourceEntries = entriesFor(kind);
  const manifestEntries = sourceEntries.map(({ path, content }) => ({
    path,
    mimeType: mimeByPath[path],
    size: content.length,
    sha256: sha256(content),
  }));
  const archive = zipFixture(
    sourceEntries.map(({ path, content }) => ({ name: path, content })),
  );
  const manifest: SyntheticWebEngineManifest = {
    fixtureType: 'synthetic',
    engineVersion: 'synthetic',
    label: labelFor(kind),
    entries: manifestEntries,
    zipSha256: sha256(archive),
  };
  return { archive, manifest };
}

type ReadEntry = { path: string; content: Buffer };

async function inspectArchive(archive: Buffer): Promise<ReadEntry[]> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(archive, { lazyEntries: true }, (error, opened) => {
      if (error || !opened) reject(error ?? new Error('Unable to open ZIP'));
      else resolve(opened);
    });
  });
  const entries: ReadEntry[] = [];
  return await new Promise((resolve, reject) => {
    zip.readEntry();
    zip.on('entry', (entry) => {
      if (entry.fileName.endsWith('/')) return zip.readEntry();
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream)
          return reject(error ?? new Error('Unable to read ZIP entry'));
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
          entries.push({
            path: entry.fileName,
            content: Buffer.concat(chunks),
          });
          zip.readEntry();
        });
      });
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
  });
}

export async function validateSyntheticWebEngineFixture(
  fixture: SyntheticWebEngineFixture,
): Promise<void> {
  if (fixture.manifest.fixtureType !== 'synthetic')
    throw new Error('Invalid fixture type');
  if (fixture.manifest.engineVersion !== 'synthetic')
    throw new Error('Invalid engine version');
  if (
    !/^(synthetic-unity-webgl|synthetic-godot-web)$/.test(
      fixture.manifest.label,
    )
  )
    throw new Error('Invalid fixture label');
  if (fixture.manifest.zipSha256 !== sha256(fixture.archive))
    throw new Error('ZIP digest does not match archive');

  const inspected = await inspectArchive(fixture.archive);
  const paths = inspected.map(({ path }) => path);
  if (new Set(paths).size !== paths.length)
    throw new Error('Duplicate ZIP entry');
  if (paths.some((path) => !mimeByPath[path]))
    throw new Error('Unexpected ZIP entry');
  const expectedPayload =
    fixture.manifest.label === 'synthetic-unity-webgl'
      ? 'Build/synthetic.data'
      : 'synthetic.pck';
  const expectedPaths = [
    'index.html',
    'loader.js',
    'runtime.wasm',
    expectedPayload,
  ];
  if (
    paths.length !== expectedPaths.length ||
    expectedPaths.some((path) => !paths.includes(path))
  )
    throw new Error('Required ZIP entry missing');
  if (
    inspected
      .find(({ path }) => path === 'runtime.wasm')
      ?.content.equals(wasm) !== true
  )
    throw new Error('Invalid WASM entry');

  if (fixture.manifest.entries.length !== inspected.length)
    throw new Error('Manifest entry count mismatch');
  const manifestPaths = fixture.manifest.entries.map((entry) => entry.path);
  if (new Set(manifestPaths).size !== manifestPaths.length)
    throw new Error('Duplicate manifest entry');
  for (const entry of fixture.manifest.entries) {
    if (mimeByPath[entry.path] !== entry.mimeType)
      throw new Error('MIME contract mismatch');
    const actual = inspected.find((candidate) => candidate.path === entry.path);
    if (
      !actual ||
      actual.content.length !== entry.size ||
      sha256(actual.content) !== entry.sha256
    )
      throw new Error(`Entry digest mismatch: ${entry.path}`);
  }
}

export async function createSyntheticWebEngineFixture(
  kind: SyntheticEngineKind,
): Promise<SyntheticWebEngineFixture> {
  const fixture = await buildOnce(kind);
  await validateSyntheticWebEngineFixture(fixture);
  const repeat = await buildOnce(kind);
  if (
    !fixture.archive.equals(repeat.archive) ||
    JSON.stringify(fixture.manifest) !== JSON.stringify(repeat.manifest)
  )
    throw new Error('Synthetic fixture generation is not deterministic');
  return fixture;
}
