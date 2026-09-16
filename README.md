# TFGhub

TFGhub is a Vietnamese web platform for creating, reviewing, sharing, and playing small browser games. It contains both the established upload/code/story/platformer workflow and the newer revision-based ENGINE Studio.

## Quick start

Requirements: Node.js 22, pnpm 10, Docker, and Docker Compose v2.

```bash
corepack enable
cp .env.example .env
openssl rand -hex 32
# Paste the generated value after JWT_SECRET= in .env before continuing.
docker compose up -d postgres
pnpm install --frozen-lockfile
set -a && . ./.env && set +a
pnpm db:generate
pnpm --filter @indieforge/database prisma migrate deploy
pnpm dev
```

Open the web application at <http://localhost:3000> and the API health endpoint at <http://localhost:3001/health>.

## Documentation

The project knowledge base starts at **[docs/README.md](docs/README.md)**. Read it before changing the application. Key references include the [architecture](docs/02-architecture/system-architecture.md), [API](docs/05-api/README.md), [database](docs/06-database/schema-and-migrations.md), [development guide](docs/09-development/setup-and-testing.md), [deployment runbook](docs/10-deployment/runbook.md), and [agent rules](docs/08-rules/agent-rules.md).

## Current scope

Legacy `UPLOAD`, `CODE`, `STORY`, and `PLATFORMER` games support authoring, artifact generation, moderation, discovery, and sandboxed play. ENGINE games support canonical V2 documents, immutable revisions, typed mutation batches, scene editing, Canvas2D Studio previews, and immutable project assets. ENGINE build/release execution is not complete; database build and release models are foundations, not proof of a delivered runtime pipeline.

Production uses PostgreSQL and a durable `game_storage` volume containing game artifacts, covers, project assets, and thumbnails.
