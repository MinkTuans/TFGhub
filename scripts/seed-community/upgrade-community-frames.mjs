import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDataset } from './data.mjs';
import { definitions } from './seed.mjs';

export const FRAME_UPGRADE_CONFIRM = 'community-frame-upgrade-20260921-v1';
const UPGRADED_ARTIFACT_VERSION = 2;

async function assertFiles(storage, id, version, files) {
  for (const file of files) {
    const installed = await storage.read(id, version, file.path);
    assert.equal(installed.content.toString(), String(file.content), 'Artifact version exists with different content');
    assert.equal(installed.contentType, file.contentType, 'Artifact version exists with different content type');
  }
}

async function installOrVerify(storage, id, version, files) {
  try {
    await storage.install(id, version, files);
  } catch {
    await assertFiles(storage, id, version, files);
  }
}

export async function upgradeCommunityFrames(db, data, { storage, compile }) {
  assert.equal(data.games.length, 10, 'Expected exactly ten community games');
  const expected = new Map(data.games.map((game) => [game.id, game]));
  const rows = await db.game.findMany({
    where: { id: { in: [...expected.keys()] } },
    select: {
      id: true,
      slug: true,
      ownerId: true,
      artifactVersion: true,
      artifactReady: true,
      visibility: true,
      reviewState: true,
      moderationState: true,
    },
  });
  assert.equal(rows.length, expected.size, 'Community game set is incomplete');
  for (const row of rows) {
    const game = expected.get(row.id);
    assert(game, 'Unexpected community game');
    assert.equal(row.slug, game.slug, 'Community game slug changed');
    assert.equal(row.ownerId, game.ownerId, 'Community game owner changed');
    assert.equal(row.artifactReady, true, 'Community artifact is not ready');
    assert.equal(row.visibility, 'PUBLIC', 'Community game is no longer public');
    assert.equal(row.reviewState, 'APPROVED', 'Community game is no longer approved');
    assert.equal(row.moderationState, 'CLEAR', 'Community game is no longer clear');
  }

  if (rows.every((row) => row.artifactVersion === UPGRADED_ARTIFACT_VERSION)) {
    for (const game of data.games)
      await assertFiles(storage, game.id, UPGRADED_ARTIFACT_VERSION, compile(game.projectData));
    return { upgraded: false, games: data.games.length, artifactVersion: UPGRADED_ARTIFACT_VERSION };
  }

  assert(rows.every((row) => row.artifactVersion === UPGRADED_ARTIFACT_VERSION - 1), 'Community games are on mixed artifact versions');
  for (const game of data.games)
    await installOrVerify(storage, game.id, UPGRADED_ARTIFACT_VERSION, compile(game.projectData));

  await db.$transaction(async (tx) => {
    for (const game of data.games) {
      const result = await tx.game.updateMany({
        where: { id: game.id, artifactVersion: UPGRADED_ARTIFACT_VERSION - 1, artifactReady: true, visibility: 'PUBLIC', reviewState: 'APPROVED', moderationState: 'CLEAR' },
        data: { projectData: game.projectData, artifactVersion: UPGRADED_ARTIFACT_VERSION, artifactReady: true },
      });
      assert.equal(result.count, 1, 'Community game changed while upgrading');
    }
  });
  return { upgraded: true, games: data.games.length, artifactVersion: UPGRADED_ARTIFACT_VERSION };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.includes('--apply'), 'Use --apply to run the community frame upgrade');
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), process.env.SEED_EXPECTED_DATABASE, 'Explicit target database name required');
  assert.equal(process.env.SEED_CONFIRM, FRAME_UPGRADE_CONFIRM, 'Explicit upgrade confirmation required');
  const [{ PrismaClient }, { ArtifactStorage }, { compileCode }] = await Promise.all([
    import('../../packages/database/generated/client/index.js'),
    import('../../apps/api/dist/game-artifacts/artifact-storage.js'),
    import('../../apps/api/dist/game-artifacts/code-compiler.js'),
  ]);
  const db = new PrismaClient();
  try {
    const data = createDataset(await definitions());
    console.log(JSON.stringify(await upgradeCommunityFrames(db, data, { storage: new ArtifactStorage(), compile: compileCode })));
  } finally {
    await db.$disconnect();
  }
}
