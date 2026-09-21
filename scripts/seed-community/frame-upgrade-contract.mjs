import assert from 'node:assert/strict';
import { createDataset } from './data.mjs';
import { definitions } from './seed.mjs';
import { upgradeCommunityFrames } from './upgrade-community-frames.mjs';

const data = createDataset(await definitions());
const rows = data.games.map((game) => ({
  id: game.id,
  slug: game.slug,
  ownerId: game.ownerId,
  projectData: { stale: true },
  artifactVersion: 1,
  artifactReady: true,
  visibility: 'PUBLIC',
  reviewState: 'APPROVED',
  moderationState: 'CLEAR',
}));
const storage = new Map();
const db = {
  game: {
    findMany: async () => rows,
    updateMany: async ({ where, data: update }) => {
      const row = rows.find((candidate) => candidate.id === where.id && candidate.artifactVersion === where.artifactVersion);
      if (!row) return { count: 0 };
      Object.assign(row, update);
      return { count: 1 };
    },
  },
  $transaction: async (callback) => callback(db),
};
const artifactStorage = {
  async install(id, version, files) {
    storage.set(`${id}/${version}`, files);
  },
  async read(id, version, path) {
    const file = storage.get(`${id}/${version}`)?.find((candidate) => candidate.path === path);
    if (!file) throw new Error('missing artifact');
    return { content: Buffer.from(file.content), contentType: file.contentType };
  },
};

const result = await upgradeCommunityFrames(db, data, {
  storage: artifactStorage,
  compile: (project) => [{ path: 'index.html', contentType: 'text/html', content: project.html }],
});

assert.deepEqual(result, { upgraded: true, games: 10, artifactVersion: 2 });
for (const [index, row] of rows.entries()) {
  assert.equal(row.artifactVersion, 2);
  assert.equal(row.visibility, 'PUBLIC');
  assert.equal(row.reviewState, 'APPROVED');
  assert.deepEqual(row.projectData, data.games[index].projectData);
  assert.equal(storage.has(`${row.id}/2`), true);
}
console.log('PASS community frame upgrade publishes a v2 artifact without changing public review state.');
