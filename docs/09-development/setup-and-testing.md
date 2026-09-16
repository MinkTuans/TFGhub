# Development and testing

Production operators should use the [deployment runbook](../10-deployment/runbook.md). Local `docker-compose.yml` starts PostgreSQL; production Compose runs migrations, API, web, and Caddy.

## Prerequisites

- Node.js 22 and pnpm 10 (`corepack enable` can provide the pinned version)
- Docker Engine and Docker Compose v2
- POSIX-compatible shell for the environment-loading examples

## Local setup

```bash
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

The web app is at <http://localhost:3000> and API at <http://localhost:3001>. Next does not automatically load the repository root `.env` for every direct package command; provide `NEXT_PUBLIC_API_URL` in the web environment when needed.

Prisma Client generation is explicit. `prisma migrate deploy` applies migrations but does not generate the client. Root development, test, typecheck, and package build scripts prepare it; `pnpm db:generate --force` deliberately bypasses the Turbo cache.

## Session behavior

Registration/login set the `indieforge_access` HTTP-only cookie. Browser requests use credentials. Mutations must have the exact `WEB_ORIGIN` and JSON content type except allowed multipart uploads. See [API authentication](../05-api/README.md#authentication-and-request-policy).

## Verification matrix

| Command | What it proves | What it does not prove |
| --- | --- | --- |
| `pnpm test` | Unit, component, contract, schema tests | API HTTP E2E, browser E2E, production deployment |
| `pnpm --filter api test:e2e` | Real Nest HTTP boundary with test repositories | Prisma/PostgreSQL behavior |
| `pnpm lint` | Workspace lint rules | Types, runtime behavior |
| `pnpm typecheck` | TypeScript boundaries | Runtime behavior |
| `pnpm build` | Production compilation | Deployment health |
| `pnpm --filter web e2e` | Browser journeys using real web/API processes and repository harness | Persistence across real PostgreSQL restarts |
| `pnpm test:e2e:studio-assets` | Disposable PostgreSQL, migrations, real API/web, asset storage, Playwright | Production host configuration |
| `pnpm test:containers` | Container image/runtime checks | Full public routing and host state |
| `pnpm test:deploy-config` | Static production Compose/Caddy configuration | Running host health |
| `pnpm test:deploy-smoke` | Production-stack smoke journey | Every feature regression |

Default Playwright uses ports 3100/3101 plus its internal Next process configuration. It replaces repositories with deterministic in-memory storage but keeps hashing, JWT, validation, services, controllers, cookies, CORS, HTTP, and rendering real.

Database integration suites skip unless dedicated `ENGINE_CORE_TEST_DATABASE_URL` or `ENGINE_GAME_SOURCE_TEST_DATABASE_URL` values are provided. Do not report skipped integration tests as PostgreSQL coverage.

## Asset Manager real-stack lane

```bash
pnpm --filter web exec playwright install chromium
pnpm test:e2e:studio-assets
```

This creates disposable PostgreSQL and storage, applies migrations, starts API/web, tests upload → metadata/thumbnail → storage/readback → Studio interaction, and cleans up its resources. Use `pnpm test:e2e:studio-assets -- --help` for supported port overrides.

## External browser verification

To run Playwright against an already running disposable stack, set `E2E_EXTERNAL_SERVICES=1`, `E2E_WEB_URL`, and temporary moderator credentials as described by the Playwright config/harness. Do not store real credentials in shell history or repository files. Local harness credentials are never production defaults.

## Database reset caution

`docker compose down -v` destroys the local Compose database volume. Use it only for an intentionally disposable local database. `docker compose stop` or `docker compose down` retains the volume.

## Scope awareness

Legacy upload/build/runtime/publishing is delivered. ENGINE editing and assets are delivered through the current Studio boundary, but ENGINE production build/release/runtime remains incomplete. See [current capabilities](../03-features/current-capabilities.md).
