import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '../packages/database/generated/client/index.js';

const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
assert.equal(databaseUrl.pathname, '/score_persistence_test', 'Disposable database only');
assert(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname), 'Local database only');
const base = process.env.SCORE_API_URL ?? 'http://127.0.0.1:3271';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local API only');
const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3270';
const projectPath = process.env.SCORE_PROJECT_FILE ?? '/tmp/tfg-score-persistence/snake-patched-project.json';
const sessionPath = process.env.SCORE_SESSION_FILE ?? '/tmp/tfg-score-persistence/sessions.json';
const db = new PrismaClient();
const runId = randomUUID().slice(0, 8);
const password = 'Score-persistence-test123!';

async function request(method, path, cookie, body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
  return { data: raw ? JSON.parse(raw) : undefined, headers: response.headers };
}
const endpoint = (game) => `/engagement/games/${game.slug}`;
const start = (game, cookie, requestId = randomUUID()) =>
  request('POST', endpoint(game) + '/plays', cookie, { requestId }, 201);
const score = (game, play, value, expected = 201) => request(
  'POST', `${endpoint(game)}/plays/${play.playId}/score`, undefined,
  { token: play.token, score: value }, expected,
);

try {
  const sessions = {};
  for (const name of ['OWNER', 'PLAYER', 'OTHER', 'BROWSER', 'MODERATOR']) {
    const email = `score-${runId}-${name.toLowerCase()}@example.test`;
    await request('POST', '/auth/register', undefined, { email, password }, 201);
    const user = await db.user.update({ where: { email }, data: { role: name === 'MODERATOR' ? 'MODERATOR' : 'USER' } });
    await db.developerProfile.create({ data: { userId: user.id, displayName: `Test ${name}` } });
    const login = await request('POST', '/auth/login', undefined, { email, password });
    sessions[name] = { id: user.id, email, password, cookie: login.headers.get('set-cookie').split(';')[0] };
  }
  const owner = sessions.OWNER.cookie;
  async function publish(suffix, project) {
    let game = (await request('POST', '/games', owner, {
      title: `Score persistence ${suffix}`, slug: `score-${runId}-${suffix}`, sourceType: 'CODE',
    }, 201)).data;
    await request('PUT', `/games/${game.id}/project`, owner, project);
    await request('POST', `/games/${game.id}/build`, owner, undefined, 201);
    game = (await request('POST', `/games/${game.id}/submit`, owner, undefined, 201)).data;
    await request('POST', `/moderation/games/${game.id}/approve`, sessions.MODERATOR.cookie, {
      artifactVersion: game.artifactVersion, submittedAt: game.submittedAt,
    }, 201);
    return game;
  }
  const game = await publish('snake', JSON.parse(await readFile(projectPath, 'utf8')));
  const otherGame = await publish('other', { sourceType: 'CODE', html: '<p>Isolation fixture</p>', css: '', javascript: '' });
  const disabled = (await start(game, sessions.PLAYER.cookie)).data;
  assert.equal(disabled.personalBest, null);
  assert.equal(disabled.scoresEnabled, false);
  await score(game, disabled, 9, 403);
  for (const target of [game, otherGame]) {
    await request('PATCH', `/games/${target.id}/engagement-settings`, owner, { scoresEnabled: true });
  }
  const play = (await start(game, sessions.PLAYER.cookie)).data;
  assert.equal(play.personalBest, null);
  assert.deepEqual((await score(game, play, 0)).data, { highScore: 0, personalBest: 0 });
  assert.equal((await start(game, sessions.PLAYER.cookie)).data.personalBest, 0);
  assert.deepEqual((await score(game, play, 41)).data, { highScore: 41, personalBest: 41 });
  const otherPlay = (await start(game, sessions.OTHER.cookie)).data;
  assert.equal(otherPlay.personalBest, null, 'Other account must not inherit record');
  assert.deepEqual((await score(game, otherPlay, 900)).data, { highScore: 900, personalBest: 900 });
  assert.deepEqual((await score(game, play, 2)).data, { highScore: 900, personalBest: 41 });

  // Age only this disposable launch beyond the server's 30-second debounce window.
  await db.gamePlay.update({ where: { id: play.playId }, data: { createdAt: new Date(Date.now() - 31000) } });
  const nextPlay = (await start(game, sessions.PLAYER.cookie)).data;
  assert.notEqual(nextPlay.playId, play.playId);
  assert.equal(nextPlay.personalBest, 41, 'New play must restore the previous play record');
  await Promise.all([80, 12, 65].map((value) => score(game, nextPlay, value)));
  assert.equal((await start(game, sessions.PLAYER.cookie)).data.personalBest, 80);
  assert.deepEqual((await score(game, nextPlay, 1)).data, { highScore: 900, personalBest: 80 });
  const isolatedPlay = (await start(otherGame, sessions.PLAYER.cookie)).data;
  assert.equal(isolatedPlay.personalBest, null, 'Other game must not inherit record');
  await score(otherGame, nextPlay, 1000, 401);
  await score(game, { ...nextPlay, token: 'x'.repeat(43) }, 1000, 401);
  await score(game, nextPlay, -1, 400);
  await score(game, nextPlay, 2147483648, 400);

  const firstGuest = await start(game);
  const guestCookie = firstGuest.headers.get('set-cookie').split(';')[0];
  assert.equal(firstGuest.data.personalBest, null);
  await score(game, firstGuest.data, 23);
  assert.equal((await start(game, guestCookie)).data.personalBest, 23);
  assert.equal((await start(game)).data.personalBest, null, 'Another browser must not inherit guest record');
  assert.equal((await start(game, `${sessions.PLAYER.cookie}; ${guestCookie}`)).data.personalBest, 80, 'Login identity overrides guest identity');
  assert.equal((await start(otherGame, guestCookie)).data.personalBest, null);

  await request('PATCH', `/games/${game.id}/engagement-settings`, owner, { scoresEnabled: false });
  assert.equal((await start(game, sessions.PLAYER.cookie)).data.personalBest, null);
  await score(game, nextPlay, 1000, 403);
  await request('PATCH', `/games/${game.id}/engagement-settings`, owner, { scoresEnabled: true });
  assert.equal((await start(game, sessions.PLAYER.cookie)).data.personalBest, 80);
  await db.user.update({ where: { id: sessions.PLAYER.id }, data: { isActive: false } });
  await score(game, nextPlay, 1000, 401);
  await db.user.update({ where: { id: sessions.PLAYER.id }, data: { isActive: true } });
  await db.gamePlay.update({ where: { id: firstGuest.data.playId }, data: { expiresAt: new Date(0) } });
  await score(game, firstGuest.data, 1000, 401);
  await db.game.update({ where: { id: game.id }, data: { moderationState: 'QUARANTINED' } });
  await score(game, nextPlay, 1000, 404);
  await db.game.update({ where: { id: game.id }, data: { moderationState: 'CLEAR' } });
  const replayId = randomUUID();
  const restored = await start(game, sessions.PLAYER.cookie, replayId);
  assert.equal(restored.data.personalBest, 80);
  assert.match(restored.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await start(game, sessions.PLAYER.cookie, replayId)).data.personalBest, 80);
  await writeFile(sessionPath, JSON.stringify({ sessions, gameId: game.id, slug: game.slug, otherGameId: otherGame.id, otherSlug: otherGame.slug, browserUser: 'BROWSER', personalBest: 80, highScore: 900 }), { mode: 0o600 });
  await chmod(sessionPath, 0o600);
  console.log('PASS real API persistence: published patched Snake; zero/null; reload and separate plays; concurrent max; distinct personal/global records; account/guest/game isolation; disabled/expired/invalid/inactive/quarantined guards; private cache policy.');
  console.log(`Browser fixture slug: ${game.slug}; protected sessions: ${sessionPath}`);
} finally {
  await db.$disconnect();
}
