# IndieForge

IndieForge is a monorepo for a small-game platform. This foundation slice provides account sessions, developer profiles, private game drafts, and a public-game read API.

## Quick start

Prerequisites: Node.js 22 (the repository is verified with Node 22), pnpm 10 (Corepack is recommended), and Docker with Docker Compose v2. Docker runs PostgreSQL 16; no local PostgreSQL installation is required.

```bash
corepack enable
cp .env.example .env
# Set JWT_SECRET in .env, for example with: openssl rand -hex 32
docker compose up -d postgres
pnpm install
pnpm --filter @indieforge/database prisma migrate deploy
set -a && . ./.env && set +a && pnpm dev
```

The final command keeps the API and web development servers running. Open the web app at [http://localhost:3000](http://localhost:3000), the API at [http://localhost:3001](http://localhost:3001), and its health check at [http://localhost:3001/health](http://localhost:3001/health).

`set -a && . ./.env && set +a` exports the root environment file for Turbo and the API. Use a shell with POSIX `source`/`.` support (such as bash or zsh), or export the same keys through your shell or process manager.

See [the development guide](docs/development.md) for the complete workflow and [the foundation API guide](docs/api/foundation.md) for endpoint examples.

## Scope of this slice

Build upload, malware scanning, game runtime hosting, analytics, donations, and game publishing are planned, but are not delivered here. In particular, new games are always drafts: the public catalog endpoints only return already-public, clear games and this slice has no endpoint to publish a draft.
