# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing IndieForge foundation deployable as a verified single-host HTTPS stack with same-origin authentication, durable PostgreSQL, gated migrations, health checks, and an operator runbook.

**Architecture:** Caddy is the only public service and routes `/api/*` to NestJS while routing every other request to Next.js. Browser API requests use the relative `/api` prefix, server-rendered requests use the private `http://api:3001` address, and a one-shot migration service gates API startup against PostgreSQL.

**Tech Stack:** Node.js 22, pnpm 10.0.0, Next.js 16, NestJS 12, Prisma 6, PostgreSQL 16, Docker Compose v2, Caddy 2, Vitest, Bash

**Spec:** `docs/superpowers/specs/2026-09-05-production-deployment-design.md`

## Global Constraints

- Preserve the existing application feature scope and public API contracts.
- Keep browser and API traffic on one public origin; do not broaden cookie scope to sibling domains.
- Caddy is the only service that publishes host ports; PostgreSQL, API, and web remain private.
- Use Node.js 22, pnpm 10.0.0, PostgreSQL 16 Alpine, and Caddy 2 Alpine.
- Never bake `JWT_SECRET`, `POSTGRES_PASSWORD`, or a production `DATABASE_URL` into an image.
- Run only committed Prisma migrations in production and block API startup when migration fails.
- Run application containers as a non-root user and use `restart: unless-stopped` for long-running services.
- Local smoke verification must use disposable state and remove its containers and volume on exit.

---

### Task 1: Runtime-aware API routing

**Files:**
- Modify: `apps/web/tests/api-client.test.ts`
- Modify: `apps/web/lib/api-client.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_API_URL` for the browser-visible API prefix and `API_INTERNAL_URL` for server-side requests.
- Produces: `resolveApiBaseUrl(): string`, returning the normalized runtime-specific base URL used by every method on `api`.

- [ ] **Step 1: Add focused failing tests for browser and server routing**

Add isolated module tests that reset modules and environment variables before importing the client:

```ts
test("uses the internal API URL during server rendering", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:3001/");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../lib/api-client");

  await api.get("/health");

  expect(fetch).toHaveBeenCalledWith(
    "http://api:3001/health",
    expect.objectContaining({ method: "GET" }),
  );
});

test("uses the public API prefix in a browser", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:3001");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/");
  vi.stubGlobal("window", {});
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../lib/api-client");

  await api.get("/health");

  expect(fetch).toHaveBeenCalledWith(
    "/api/health",
    expect.objectContaining({ method: "GET" }),
  );
});
```

Update the existing `afterEach` to restore environment, globals, and module state. Remove the top-level `api` import so each test imports after setting its runtime.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter web test -- tests/api-client.test.ts`

Expected: the server test requests `/api/health` instead of `http://api:3001/health`, proving the internal-route behavior is absent.

- [ ] **Step 3: Implement the minimal runtime selector**

Replace the module-level `baseUrl` with:

```ts
export function resolveApiBaseUrl(): string {
  const configured =
    typeof window === "undefined"
      ? process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
      : process.env.NEXT_PUBLIC_API_URL;
  return (configured ?? "http://localhost:3001").replace(/\/$/, "");
}
```

Build request URLs with `` `${resolveApiBaseUrl()}${path}` ``. Keep the existing credentials, cache, headers, body, and error behavior unchanged.

- [ ] **Step 4: Run focused and full web tests**

Run: `pnpm --filter web test -- tests/api-client.test.ts`

Expected: all API-client tests pass.

Run: `pnpm --filter web test`

Expected: all web unit/component tests pass.

- [ ] **Step 5: Commit runtime routing**

```bash
git add apps/web/lib/api-client.ts apps/web/tests/api-client.test.ts
git commit -m "fix: route server API calls over the private network"
```

### Task 2: Reproducible application container images

**Files:**
- Create: `.dockerignore`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `scripts/test-container-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository lockfile/workspaces, API `dist/main.js`, web `.next`, and build argument `NEXT_PUBLIC_API_URL`.
- Produces: `indieforge-api` and `indieforge-web` OCI images whose default commands listen on ports 3001 and 3000 as user `node`.

- [ ] **Step 1: Add a failing container contract test**

Create `scripts/test-container-contract.mjs` using `node:assert/strict` and `node:fs` to require both Dockerfiles and assert:

```js
assert.match(api, /^FROM node:22-bookworm-slim AS build/m);
assert.match(api, /corepack prepare pnpm@10\.0\.0 --activate/);
assert.match(api, /pnpm --filter api build/);
assert.match(api, /USER node/);
assert.match(api, /CMD \["node", "apps\/api\/dist\/main\.js"\]/);
assert.match(web, /ARG NEXT_PUBLIC_API_URL=\/api/);
assert.match(web, /pnpm --filter web build/);
assert.match(web, /USER node/);
assert.match(web, /CMD \["pnpm", "--filter", "web", "start"\]/);
```

Add root script `test:containers` with value `node scripts/test-container-contract.mjs`.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `pnpm test:containers`

Expected: FAIL because `apps/api/Dockerfile` does not exist.

- [ ] **Step 3: Add the shared build context exclusions**

Create `.dockerignore` containing generated dependencies/artifacts, secrets, VCS metadata, agent worktrees, test output, and deployment backups:

```dockerignore
.git
.worktrees
.superpowers
node_modules
**/node_modules
.next
**/.next
dist
**/dist
.turbo
**/.turbo
coverage
**/coverage
.env
.env.*
!.env.example
!.env.production.example
backups
test-results
playwright-report
```

- [ ] **Step 4: Add the API Dockerfile**

Create `apps/api/Dockerfile` with a Node 22 Bookworm Slim build stage that enables Corepack, activates pnpm 10.0.0, copies workspace manifests before source, installs with `--frozen-lockfile`, copies the repository, and runs `pnpm --filter api build`. The runtime stage repeats only the Corepack activation, copies `/app` from the build stage with `--chown=node:node`, sets `NODE_ENV=production` and `API_PORT=3001`, exposes 3001, switches to `USER node`, and starts `node apps/api/dist/main.js`.

- [ ] **Step 5: Add the web Dockerfile**

Create `apps/web/Dockerfile` with the same deterministic install pattern. Declare `ARG NEXT_PUBLIC_API_URL=/api` and set it for `pnpm --filter web build`. In the runtime stage set `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, and `PORT=3000`; copy `/app` with node ownership, expose 3000, switch to `USER node`, and start `pnpm --filter web start`.

- [ ] **Step 6: Run contract tests and build both images**

Run: `pnpm test:containers`

Expected: PASS and print `container contracts valid`.

Run: `docker build -f apps/api/Dockerfile -t indieforge-api:test .`

Expected: image builds successfully and contains `apps/api/dist/main.js` plus the generated Prisma client.

Run: `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=/api -t indieforge-web:test .`

Expected: image builds successfully and contains the production `.next` output.

- [ ] **Step 7: Verify image metadata and commit**

Run:

```bash
node -e 'for (const image of ["indieforge-api:test", "indieforge-web:test"]) require("node:child_process").execFileSync("docker", ["image", "inspect", image], { stdio: "inherit" })'
```

Expected: both inspections exit zero.

```bash
git add .dockerignore apps/api/Dockerfile apps/web/Dockerfile scripts/test-container-contract.mjs package.json
git commit -m "build: add production application images"
```

### Task 3: Production Compose topology and proxy

**Files:**
- Create: `.env.production.example`
- Create: `compose.production.yml`
- Create: `deploy/Caddyfile`
- Create: `scripts/test-deployment-config.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DEPLOY_ADDRESS`, `HTTP_PORT`, `SITE_ORIGIN`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `JWT_SECRET` from `--env-file`.
- Produces: Compose services named `postgres`, `migrate`, `api`, `web`, and `proxy`; public `/api/*` routing; volumes `postgres_data`, `caddy_data`, and `caddy_config`.

- [ ] **Step 1: Add a failing rendered-configuration test**

Create `scripts/test-deployment-config.mjs`. It should create a temporary environment file with these exact non-secret test values, run `docker compose --env-file <file> -f compose.production.yml config --format json`, parse JSON, and clean the temporary directory in `finally`:

```text
DEPLOY_ADDRESS=:80
HTTP_PORT=8080
SITE_ORIGIN=http://localhost:8080
POSTGRES_DB=indieforge
POSTGRES_USER=indieforge
POSTGRES_PASSWORD=0123456789abcdef0123456789abcdef
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Assert that only `proxy` has `ports`, PostgreSQL has a healthcheck, `migrate` depends on healthy PostgreSQL, `api` depends on successful migration, web receives `API_INTERNAL_URL=http://api:3001`, API receives the exact `WEB_ORIGIN`, proxy maps host 8080 to container 80, and none of the rendered image build arguments or environment values contain the JWT secret except `api.environment.JWT_SECRET`.

Add root script `test:deploy-config` with value `node scripts/test-deployment-config.mjs`.

- [ ] **Step 2: Run the configuration test and verify RED**

Run: `pnpm test:deploy-config`

Expected: FAIL because `compose.production.yml` does not exist.

- [ ] **Step 3: Add production environment documentation and ignores**

Create `.env.production.example` with the six variables from the interface, safe explanatory comments, `HTTP_PORT=80`, and empty secret values. Add `.env.production`, `.env.production.local`, and `backups/` to `.gitignore` while retaining the example file.

- [ ] **Step 4: Add Caddy same-origin routing**

Create `deploy/Caddyfile`:

```caddyfile
{$DEPLOY_ADDRESS} {
  encode zstd gzip

  handle_path /api/* {
    reverse_proxy api:3001
  }

  handle {
    reverse_proxy web:3000
  }
}
```

- [ ] **Step 5: Add the production Compose definition**

Create `compose.production.yml` with:

- PostgreSQL 16 Alpine, no published port, `pg_isready` healthcheck, and `postgres_data`.
- `migrate` built from the API Dockerfile, `restart: "no"`, the constructed internal `DATABASE_URL`, and command `pnpm --filter @indieforge/database prisma migrate deploy`.
- `api` using the same image/build, fixed production variables, JWT secret, direct Node-fetch healthcheck, `restart: unless-stopped`, and `condition: service_completed_successfully` on `migrate`.
- `web` built with `NEXT_PUBLIC_API_URL=/api`, runtime `API_INTERNAL_URL=http://api:3001`, direct Node-fetch healthcheck, and `restart: unless-stopped`.
- Caddy 2 Alpine with `DEPLOY_ADDRESS`, `${HTTP_PORT:-80}:80`, `443:443`, `443:443/udp`, the Caddyfile mounted read-only, both Caddy volumes, and healthy API/web dependencies.

Use Compose required-variable syntax such as `${JWT_SECRET:?set JWT_SECRET}` for every secret and origin. Do not publish API, web, or database ports.

- [ ] **Step 6: Run configuration checks**

Run: `pnpm test:deploy-config`

Expected: PASS and print `deployment configuration valid`.

Run:

```bash
docker compose --env-file .env.production.example -f compose.production.yml config --quiet
```

Expected: FAIL with a clear required-variable error because example secrets are empty; this verifies unsafe defaults cannot render a deployable production stack.

- [ ] **Step 7: Commit the deployment topology**

```bash
git add .env.production.example .gitignore compose.production.yml deploy/Caddyfile scripts/test-deployment-config.mjs package.json
git commit -m "feat: define the production deployment stack"
```

### Task 4: Disposable full-stack smoke journey

**Files:**
- Create: `scripts/smoke-production.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: `compose.production.yml`, Docker Compose v2, and host port 8080.
- Produces: root command `pnpm test:deploy-smoke` that verifies a clean database and all public flows through Caddy, then always removes the test project and its volumes.

- [ ] **Step 1: Write the smoke test before changing deployment behavior**

Create an executable `scripts/smoke-production.sh` with `set -euo pipefail`. Create a temporary environment file and cookie jar with `mktemp -d`, derive a unique `COMPOSE_PROJECT_NAME` from the shell PID, and register an `EXIT` trap that runs:

```bash
docker compose --env-file "$smoke_dir/.env.production" -f compose.production.yml down --volumes --remove-orphans
rm -r "$smoke_dir"
```

Use the same local values as the configuration test, with a unique registration email. Start the stack using `docker compose ... up -d --build --wait`, poll `http://localhost:8080/api/health` for at most 120 seconds, and fail with `docker compose ps` plus service logs if it never returns `{"status":"ok"}`.

Exercise these public calls with curl and assert JSON using inline Node processes:

1. `POST /api/auth/register` with `Origin: http://localhost:8080`, JSON body, and a cookie jar; expect the registered email.
2. `PUT /api/developers/me` with the cookie, origin, and profile JSON; expect the display name.
3. `POST /api/games` with the cookie, origin, and draft JSON; expect the slug and `DRAFT` status.
4. `GET /api/games/mine` with the cookie; expect the new slug.
5. `GET /api/discover`; expect a valid response whose `items` array excludes the private draft.
6. `GET /studio` with the cookie through Caddy; expect HTTP 200 and the profile display name in the HTML, proving SSR forwarded the same-origin cookie to the internal API.

Add root script `test:deploy-smoke` with value `bash scripts/smoke-production.sh`.

- [ ] **Step 2: Run the smoke journey and observe the first real failure**

Run: `pnpm test:deploy-smoke`

Expected: either the entire journey passes immediately from Tasks 1–3 or it fails at a specific image, readiness, migration, routing, cookie, or response assertion. Record the exact failing boundary before modifying production configuration.

- [ ] **Step 3: Diagnose any observed deployment failure before changing configuration**

If Step 2 fails, invoke `superpowers:systematic-debugging`, identify whether the failing boundary is image content, readiness, migration, proxy routing, cookie transport, or response shape, and add the smallest regression assertion to `scripts/test-container-contract.mjs`, `scripts/test-deployment-config.mjs`, or `scripts/smoke-production.sh` that reproduces it. Re-run that assertion to verify it fails for the observed reason, then change only the responsible Dockerfile, Compose field, Caddy route, or API base selector. Do not weaken a smoke assertion. If Step 2 passes, record that no corrective production change is required and continue to Step 4.

- [ ] **Step 4: Re-run the full smoke journey**

Run: `pnpm test:deploy-smoke`

Expected: PASS with messages for health, registration, authenticated profile/draft, SSR studio, and cleanup. Confirm `docker compose -p "$previous_project_name" ps -a` lists no remaining containers and `docker volume ls` lists no volume for that project.

- [ ] **Step 5: Run the browser journey against the production stack**

Start the disposable stack without the smoke script's cleanup trap, then run:

```bash
E2E_EXTERNAL_SERVICES=1 E2E_WEB_URL=http://localhost:8080 pnpm --filter web e2e
```

Expected: all browser journeys pass against Caddy, real API, and real PostgreSQL. Tear down the dedicated Compose project with `down --volumes --remove-orphans` after the result is captured.

- [ ] **Step 6: Commit the smoke verification**

```bash
git add scripts/smoke-production.sh package.json
git commit -m "test: verify the production stack end to end"
```

### Task 5: Operator runbook and release verification

**Files:**
- Create: `docs/deployment.md`
- Modify: `README.md`
- Modify: `docs/development.md`

**Interfaces:**
- Consumes: production Compose commands and variables established in Tasks 2–4.
- Produces: an operator-facing deployment runbook and discoverable links from existing documentation.

- [ ] **Step 1: Add a failing documentation contract check**

Before writing the runbook, run:

```bash
test -f docs/deployment.md && rg -q 'docs/deployment.md' README.md && rg -q 'pg_dump' docs/deployment.md && rg -q 'pg_restore' docs/deployment.md
```

Expected: FAIL because `docs/deployment.md` does not exist.

- [ ] **Step 2: Write the production runbook**

Create `docs/deployment.md` with exact commands for:

- Ubuntu/Linux prerequisites, firewall ports 80/443, DNS A/AAAA records, and Docker Compose v2 verification.
- Cloning an explicit revision, copying `.env.production.example`, generating independent hexadecimal secrets with `openssl rand -hex 32`, setting file mode 600, and validating config.
- Initial `up -d --build --wait`, inspection of migration logs, `/api/health`, service status, and browser flows.
- Routine logs, restart, stop without deleting data, and explicit warning against `down --volumes` in production.
- A timestamped `mkdir -p backups && docker compose exec -T postgres pg_dump --format=custom ... > backups/<timestamp>.dump` backup.
- A confirmation-first restore using `pg_restore --clean --if-exists --no-owner`, including stopping API/web during restore and restarting only after success.
- Upgrade by backup, fetch, checkout of an explicit commit/tag, rebuild, migration, health verification, and delayed image pruning.
- Application rollback to the previous Git revision and database restore when a migration is incompatible; explicitly state that Prisma production migrations are not automatically reversed.
- Certificate persistence, secret rotation consequences, minimum backup handling, and the limits of single-host availability.

- [ ] **Step 3: Link deployment guidance from existing docs**

Add a short `Production deployment` paragraph to `README.md` linking `docs/deployment.md`. Add a production note to `docs/development.md` that directs operators to the runbook and distinguishes local `docker-compose.yml` from `compose.production.yml`.

- [ ] **Step 4: Run documentation and configuration checks**

Run:

```bash
test -f docs/deployment.md && rg -q 'docs/deployment.md' README.md && rg -q 'pg_dump' docs/deployment.md && rg -q 'pg_restore' docs/deployment.md
```

Expected: PASS.

Run: `pnpm test:containers && pnpm test:deploy-config`

Expected: both deployment contract suites pass.

- [ ] **Step 5: Run all repository release gates**

Run each command independently and retain its exit status:

```bash
pnpm test
pnpm --filter api test:e2e
pnpm --filter web e2e
pnpm lint
pnpm typecheck
pnpm --filter api build
NEXT_PUBLIC_API_URL=/api API_INTERNAL_URL=http://api:3001 pnpm --filter web build
pnpm test:deploy-smoke
```

Expected: every command exits zero; report exact test counts from unit, HTTP, and browser suites. The final smoke run must leave no disposable containers or volumes.

- [ ] **Step 6: Check repository state and commit documentation**

Run: `git diff --check && git status --short`

Expected: only the three intended documentation files are modified and no generated secret or backup is present.

```bash
git add README.md docs/development.md docs/deployment.md
git commit -m "docs: add the production operations runbook"
```

- [ ] **Step 7: Request final code review before integration**

Use `superpowers:requesting-code-review` against the complete branch diff from its merge base. Address only verified findings, rerun the affected checks after each correction, then run the full release gates once more before offering branch integration options.
