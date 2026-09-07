# Development guide

Production operators should follow [the deployment runbook](deployment.md). Local `docker-compose.yml` starts the development database; `compose.production.yml` runs the production database, migration job, API, web, and proxy with a separate environment file and persistent volumes.

## Prerequisites

- Node.js 22 and pnpm 10 (`corepack enable` can provide the repository-pinned pnpm version).
- Docker Engine and Docker Compose v2 for PostgreSQL 16.
- A POSIX-compatible shell for the environment-loading example below.

## Environment

Create a local environment file and provide a non-empty signing secret:

```bash
cp .env.example .env
openssl rand -hex 32
```

Paste the generated value into `JWT_SECRET=` in `.env`. The other keys have local defaults:

| Key | Purpose | Local default |
| --- | --- | --- |
| `DATABASE_URL` | Prisma PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/indieforge?schema=public` |
| `JWT_SECRET` | Required HS256 session-token signing secret | no default; set a random value |
| `API_PORT` | API listener port | `3001` |
| `WEB_ORIGIN` | Exact trusted origin for browser mutations and credentialed CORS | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API base URL embedded by the web app | `http://localhost:3001` |

Do not commit `.env` or reuse a development `JWT_SECRET` in production.

## Start locally

From the repository root:

```bash
docker compose up -d postgres
pnpm install --frozen-lockfile
set -a && . ./.env && set +a
pnpm db:generate
pnpm --filter @indieforge/database prisma migrate deploy
pnpm dev
```

`docker compose up -d postgres` starts only the `postgres` service defined in `docker-compose.yml`. `prisma migrate deploy` applies committed migrations without creating a new one. The `pnpm dev` process starts the Next.js web app at [http://localhost:3000](http://localhost:3000) and the Nest API at [http://localhost:3001](http://localhost:3001); confirm the API with `curl http://localhost:3001/health`.

For subsequent starts, PostgreSQL data remains in the Compose volume; rerun `prisma migrate deploy` whenever migrations change.

Prisma Client generation is explicit because pnpm 10 can skip dependency build scripts and `prisma migrate deploy` does not generate a client. `pnpm db:generate` writes the client to ignored `packages/database/generated/client`. Turbo caches that entire output against the schema, package manifest, and lockfile, restoring missing files on a cache hit. Root development, test, and typecheck commands complete this prerequisite before parallel tasks begin; direct API build/dev/test commands and database build/test/typecheck commands also prepare it. Repeated checks reuse the cache rather than regenerate the client. To deliberately regenerate without reusing the cache, run `pnpm db:generate --force`.

## Sessions and browser requests

Registration and login set an `indieforge_access` cookie. It is HTTP-only, `SameSite=Lax`, scoped to `/`, and lasts 15 minutes. It is marked `Secure` by default when `NODE_ENV=production`; only the explicit `COOKIE_SECURE=false` HTTP preview setting disables that protection. See the deployment runbook before using this override. Protected endpoints accept this cookie only; bearer `Authorization` headers are not an alternative. The API permits credentialed browser requests only from `WEB_ORIGIN`, and the web app uses `credentials: "include"`.

Every browser mutation, including registration, login, and logout, must send an `Origin` exactly matching `WEB_ORIGIN`. An untrusted or opaque (`null`) origin returns `403`; browser requests identified by fetch metadata also require an origin. Mutation bodies accept only `application/json` (`415` for HTML form content types). Bodyless logout remains supported. Non-browser JSON clients such as curl may omit `Origin`; these checks complement the API's authentication and ownership rules.

When calling the API manually, save and resend the cookie, for example:

```bash
curl --cookie-jar .cookies.json -H 'Content-Type: application/json' \
  --data '{"email":"dev@example.test","password":"password123"}' \
  http://localhost:3001/auth/register
curl --cookie .cookies.json http://localhost:3001/auth/me
rm .cookies.json
```

## Verification

Run the full repository checks after loading `.env`:

```bash
set -a && . ./.env && set +a
pnpm test
pnpm --filter api test:e2e
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter api build
pnpm --filter web exec playwright install --with-deps chromium
pnpm --filter web e2e
```

The API HTTP suite (`pnpm --filter api test:e2e`) uses the real Nest request boundary with test repositories and requires no running PostgreSQL server. `pnpm test` runs unit/component/schema checks and does not include either HTTP or browser suites. The default browser suite needs Chromium and its OS dependencies installed by the command above, plus free ports 3100 and 3101; it starts its own web/API processes with test repositories. See [browser verification](../apps/web/README.md#verify) for the harness limits, using an existing Chromium executable, and running against a real PostgreSQL-backed stack.

To test migrations from an empty local Compose database, this destructive command removes only the project Compose volume, then rebuilds it:

```bash
docker compose down -v
docker compose up -d postgres
set -a && . ./.env && set +a
pnpm --filter @indieforge/database prisma migrate deploy
```

Do not use `down -v` if you need the local database data. Stop services while retaining the volume with `docker compose stop`, or remove containers while retaining it with `docker compose down`. Stop the development servers with `Ctrl-C`.

## Current scope

This foundation delivers accounts, developer profiles, game drafts, and public catalog reads. Build upload, scanning, game runtime, analytics, donations, and publishing are planned rather than delivered. A draft cannot be published through the current API.
