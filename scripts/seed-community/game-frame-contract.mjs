import assert from 'node:assert/strict';
import { definitions } from './seed.mjs';

const games = await definitions();

assert.equal(games.length, 10, 'the community dataset must contain ten games');
for (const game of games) {
  assert.doesNotMatch(game.project.html, /<h1\b/i, `${game.key} renders its title inside the game frame`);
  assert.equal(
    game.project.html.includes(game.instructions),
    false,
    `${game.key} renders its description inside the game frame`,
  );
  assert.match(game.project.html, /id="score"/, `${game.key} keeps its score gameplay UI`);
}

console.log('PASS community game frames contain gameplay, not page metadata.');
