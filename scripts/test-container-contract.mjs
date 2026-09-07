import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../apps/api/Dockerfile', import.meta.url), 'utf8');
const web = readFileSync(new URL('../apps/web/Dockerfile', import.meta.url), 'utf8');

assert.match(api, /^FROM node:22-bookworm-slim AS build/m);
assert.match(api, /corepack prepare pnpm@10\.0\.0 --activate/);
assert.match(api, /pnpm --filter api build/);
assert.match(api, /USER node/);
assert.match(api, /CMD \["node", "apps\/api\/dist\/main\.js"\]/);
assert.match(web, /ARG NEXT_PUBLIC_API_URL=\/api/);
assert.match(web, /pnpm --filter web build/);
assert.match(web, /USER node/);
assert.match(web, /CMD \["pnpm", "--filter", "web", "start"\]/);

console.log('container contracts valid');
