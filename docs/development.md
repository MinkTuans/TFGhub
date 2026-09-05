# Development guide

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
| `WEB_ORIGIN` | Origin permitted for credentialed API CORS requests | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API base URL embedded by the web app | `http://localhost:3001` |

Do not commit `.env` or reuse a development `JWT_SECRET` in production.

## Start locally

From the repository root:

```bash
docker compose up -d postgres
pnpm install
set -a && . ./.env && set +a
pnpm --filter @indieforge/database prisma migrate deploy
pnpm dev
```

`docker compose up -d postgres` starts only the `postgres` service defined in `docker-compose.yml`. `prisma migrate deploy` applies committed migrations without creating a new one. The `pnpm dev` process starts the Next.js web app at [http://localhost:3000](http://localhost:3000) and the Nest API at [http://localhost:3001](http://localhost:3001); confirm the API with `curl http://localhost:3001/health`.

For subsequent starts, PostgreSQL data remains in the Compose volume; rerun `prisma migrate deploy` whenever migrations change.

## Sessions and browser requests

Registration and login set an `indieforge_access` cookie. It is HTTP-only, `SameSite=Lax`, scoped to `/`, and lasts 15 minutes. It is marked `Secure` when `NODE_ENV=production`. Protected endpoints accept this cookie only; bearer `Authorization` headers are not an alternative. The API permits credentialed browser requests only from `WEB_ORIGIN`, and the web app uses `credentials: "include"`.

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
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter api build
```

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
