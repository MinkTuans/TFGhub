# Production Deployment Design

## Purpose

Deploy the existing IndieForge foundation as a single-host production stack with HTTPS, durable PostgreSQL storage, deterministic database migrations, and working cookie authentication across browser and server-rendered requests.

This deployment exposes the current account, developer-profile, private game-draft, and public catalog features. Game uploads, publishing, malware scanning, playable-build hosting, analytics, donations, and moderation remain outside this slice.

## Success Criteria

- A fresh Linux host with Docker Engine and Docker Compose v2 can start the stack from the repository and one untracked production environment file.
- Caddy is the only service that publishes host ports. It serves the web application and proxies `/api/*` to the API over the private Compose network.
- Registration, login, authenticated studio navigation, logout, and public catalog requests work through one browser origin.
- PostgreSQL accepts no public host connections and stores data in a named volume.
- Committed Prisma migrations finish successfully before the API starts.
- Web and API containers expose health checks and restart automatically after a recoverable failure or host reboot.
- Operators have exact commands for initial deployment, upgrade, backup, restore, log inspection, and rollback.
- Automated checks validate API URL selection, Compose configuration, container builds, clean migration, and a reverse-proxy smoke journey.

## Chosen Architecture

The production deployment uses one Docker Compose project on one Linux host:

```text
Internet
   |
 ports 80/443
   |
 Caddy
   |-- /*       -> web:3000
   `-- /api/*   -> api:3001 (strip /api)

 api ----------> postgres:5432
 migration ----> postgres:5432
 web --SSR-----> api:3001
```

Caddy obtains and renews TLS certificates when `DEPLOY_ADDRESS` is a public domain whose DNS points to the host. Its data and configuration directories use named volumes. Local deployment verification sets `DEPLOY_ADDRESS=:80` and publishes that container port as host port 8080, which makes Caddy serve plain HTTP without public DNS or ACME.

The API, web application, migration job, and database communicate only on the default private Compose network. PostgreSQL, API, and web do not publish host ports.

## Request and Authentication Flow

The browser uses `NEXT_PUBLIC_API_URL=/api`. Caddy strips `/api` before forwarding requests to NestJS. As a result, the API's HTTP-only session cookie is set on the same host that serves Next.js, and the browser sends it to both the web routes and `/api` routes according to its path and security attributes.

Server-rendered Next.js code cannot resolve a relative URL and should not make a public network round trip. The shared API client therefore selects its base URL by runtime:

- Browser: `NEXT_PUBLIC_API_URL`, built as `/api` in the production web image.
- Server: `API_INTERNAL_URL`, configured at runtime as `http://api:3001`.

Authenticated server rendering forwards the incoming `Cookie` header to the internal API exactly as it does today. The API continues to set `HttpOnly`, `SameSite=Lax`, `Secure` cookies in production. `WEB_ORIGIN` must equal `SITE_ORIGIN`, including scheme and any non-default port, so the existing browser-origin checks accept legitimate mutations.

## Images and Processes

The repository will contain separate production Dockerfiles for `web` and `api`, based on Node.js 22. They use Corepack with pnpm 10.0.0, install from the lockfile, build only the required workspace targets, and run as a non-root user.

The first implementation favors deterministic, understandable images over aggressive dependency pruning. Multi-stage builds keep source-only build steps out of the final process path while retaining the workspace files and installed production runtime needed by pnpm workspace links and Prisma's native engine.

The services are:

- `postgres`: PostgreSQL 16 Alpine with a health check and durable data volume.
- `migrate`: a one-shot process using the API image to execute `prisma migrate deploy`; it waits for healthy PostgreSQL.
- `api`: starts only after `migrate` exits successfully, listens on port 3001, and is checked through `/health` inside its container.
- `web`: starts the built Next.js server on port 3000, uses the internal API URL for SSR, and has an HTTP health check.
- `proxy`: Caddy, dependent on healthy web and API services, publishing ports 80 and 443 and retaining certificate state.

All long-running services use `restart: unless-stopped`. The migration job does not restart after a successful exit.

## Configuration and Secrets

`.env.production.example` documents every Compose input:

- `DEPLOY_ADDRESS`: public domain for automatic HTTPS, or `:80` for local smoke testing.
- `HTTP_PORT`: host port mapped to Caddy's HTTP listener; `80` in production and `8080` for local smoke testing.
- `SITE_ORIGIN`: exact browser origin, normally `https://<DEPLOY_ADDRESS>`.
- `POSTGRES_DB`: database name.
- `POSTGRES_USER`: database user.
- `POSTGRES_PASSWORD`: URL-safe, randomly generated database password.
- `JWT_SECRET`: independently generated session signing secret of at least 32 random bytes.

Compose constructs the internal `DATABASE_URL` from the PostgreSQL values. The runbook requires URL-safe hexadecimal secrets so interpolation cannot produce an invalid PostgreSQL URL. The real `.env.production` is ignored by Git and must be readable only by the deployment account. No secret is copied into an image or committed to the repository.

`NODE_ENV=production`, `API_PORT=3001`, `WEB_ORIGIN=${SITE_ORIGIN}`, and `API_INTERNAL_URL=http://api:3001` are fixed by Compose rather than operator-configurable.

## Startup and Failure Behavior

`docker compose --env-file .env.production -f compose.production.yml up -d --build` creates or updates the stack. Compose first waits for PostgreSQL health, runs migrations, then starts API and web. Caddy becomes ready only after both application services are healthy.

If migration fails, the API does not start. Operators inspect the migration logs, correct the database or configuration problem, and rerun the deployment command. Migrations are never generated in production; only committed migrations are applied.

If API or web health checks fail after startup, Docker reports the service unhealthy and the runbook directs the operator to container logs and direct internal health checks. Restart policies recover process exits, while health status provides diagnosis rather than silently cycling a live but unhealthy process.

## Data Protection and Operations

The runbook uses `pg_dump` from the running PostgreSQL container to create a timestamped custom-format backup in an operator-owned host directory. Restore targets an explicitly named database after confirmation and uses `pg_restore`. Backups are not stored only in the Docker volume; the operator must copy them to separate storage.

Upgrades fetch an explicit Git revision, build images, run migrations, and check the public health endpoint before old images are pruned. Application rollback checks out the prior revision and rebuilds containers. Database rollback is restore-based because Prisma production migrations are forward-only; the runbook warns operators to take a backup before every upgrade.

Logs remain available through `docker compose logs`. Long-term centralized logging, metrics, alerting, multi-host failover, and automated off-host backup scheduling are intentionally outside this single-host deployment slice.

## Deployment Verification

Deployment-specific automated checks cover five layers:

1. A Vitest unit test proves that browser calls use `/api` and server-side calls use `API_INTERNAL_URL`.
2. `docker compose config` validates interpolation and service dependencies with a test environment.
3. Docker builds both application images from a clean build context.
4. A fresh disposable PostgreSQL volume applies every committed migration before API startup.
5. A smoke script starts the complete stack with `DEPLOY_ADDRESS=:80`, `HTTP_PORT=8080`, and `SITE_ORIGIN=http://localhost:8080`; it waits for health, exercises registration, authenticated profile and draft flows through Caddy, verifies public catalog access, and tears the stack down including the disposable volume.

The existing unit, HTTP integration, browser end-to-end, lint, typecheck, and production build suites remain release gates. Deployment verification must not depend on the developer's existing PostgreSQL volume or `.env` file.

## Repository Changes

- Add production Dockerfiles and a shared Docker ignore file.
- Add `compose.production.yml` and `deploy/Caddyfile`.
- Add `.env.production.example` and ignore `.env.production` plus deployment backup output.
- Add runtime-aware API base URL selection and its focused unit test.
- Add deployment validation and smoke scripts exposed through root package scripts.
- Add `docs/deployment.md` and link it from the root README.

No application feature, database schema, public API contract, or visual design changes are included.
