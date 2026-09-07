import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const sudo = spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0;
const runOffline = (command) => execFileSync(
  sudo ? 'sudo' : 'docker',
  [...(sudo ? ['docker'] : []), 'run', '--rm', '--network', 'none',
    'indieforge-api:latest', ...command],
  { encoding: 'utf8', timeout: 30000 },
);

assert.equal(runOffline(['id', '-un']).trim(), 'node');
assert.equal(runOffline(['pnpm', '--version']).trim(), '10.0.0');
console.log('API runtime pnpm works offline as node: PASS');
const help = runOffline([
  'pnpm', '--filter', '@indieforge/database', 'prisma', 'migrate', 'deploy', '--help',
]);
assert.match(help, /migrate deploy/);
console.log('API runtime migration CLI is available offline: PASS');
