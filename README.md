# IndieForge

IndieForge is a monorepo for a small-game platform. This foundation slice provides account sessions, developer profiles, private game drafts, and a public-game read API.

## Quick start

Prerequisites: Node.js 22 (the repository is verified with Node 22), pnpm 10 (Corepack is recommended), and Docker with Docker Compose v2. Docker runs PostgreSQL 16; no local PostgreSQL installation is required.

```bash
corepack enable
cp .env.example .env
# Set JWT_SECRET in .env, for example with: openssl rand -hex 32
docker compose up -d postgres
pnpm install --frozen-lockfile
set -a && . ./.env && set +a
pnpm db:generate
pnpm --filter @indieforge/database prisma migrate deploy
pnpm dev
```

The final command keeps the API and web development servers running. Open the web app at [http://localhost:3000](http://localhost:3000), the API at [http://localhost:3001](http://localhost:3001), and its health check at [http://localhost:3001/health](http://localhost:3001/health).

`set -a && . ./.env && set +a` exports the root environment file for Turbo and the API. Use a shell with POSIX `source`/`.` support (such as bash or zsh), or export the same keys through your shell or process manager.

`pnpm db:generate` explicitly prepares Prisma Client; installation and `migrate deploy` do not guarantee generation. Development, builds, typechecks, and tests that use the database also prepare it automatically, reusing Turbo's generated-client cache when the schema and dependencies are unchanged.

See [the development guide](docs/development.md) for the complete workflow and [the foundation API guide](docs/api/foundation.md) for endpoint examples.

## Scope of this slice

This slice adds HTML5 zip upload, checksum verification, in-process archive scanning, and publishing a READY version to the public catalog. Malware workers, R2 direct-to-bucket uploads, sandboxed runtime hosting, analytics, and donations are still later work. A rejected or failed scan never becomes the live version.
