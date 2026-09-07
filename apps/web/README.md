# IndieForge web

Next.js registration, login, developer profile, private drafts, and public game
discovery. Public pages render on the server; only interactive forms use client
components. Publishing and playing games are outside this foundation.

## Run

Install with `pnpm install`, configure the API as in the root README, then run
`pnpm dev`. Set `NEXT_PUBLIC_API_URL` for the web process (default
`http://localhost:3001`), for example in `apps/web/.env.local`. Next does not load
the repository root `.env` automatically.

The API URL must be reachable by both the browser and Next server. Use the same
hostname for web and API in development (different ports are fine) so the API's
HTTP-only, SameSite=Lax cookie reaches the web server. Configure `WEB_ORIGIN` on
the API to the exact web origin. Production uses HTTPS with web and API on
a shared hostname, for example through a reverse proxy: the API's host-only cookie
does not reach the web server on a separate subdomain. Browser requests
include credentials; server requests forward the incoming cookie and never cache
private responses. Tokens are never stored in JavaScript or local storage.

For a temporary bare-IP HTTP preview, the production API supports the explicit
`COOKIE_SECURE=false` override. Keep the secure default for HTTPS and follow
[the deployment runbook](../../docs/deployment.md) for the matching proxy and origin settings.

## Verify

```sh
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web exec playwright install --with-deps chromium
pnpm --filter web e2e -- account-game-flow.spec.ts
```

By default Playwright launches Next on port 3100 and the real Nest application on
3101. `e2e/api-harness.mjs` replaces only repositories with deterministic in-memory
storage and seeds one public game. Hashing, JWT verification, validation,
services, controllers, HTTP-only cookies, CORS, HTTP requests and Next rendering
all remain real. This verifies integration through the repository boundary; it
does **not** prove Prisma queries, migrations, PostgreSQL constraints, concurrency,
or persistence across process restarts.

To exercise an already running web/API/PostgreSQL stack, prompt for the
disposable moderator credentials so the password is not stored in shell
history:

```bash
read -r -p 'Moderator email: ' E2E_MODERATOR_EMAIL
read -r -s -p 'Moderator password: ' E2E_MODERATOR_PASSWORD; printf '\n'
export E2E_EXTERNAL_SERVICES=1 E2E_WEB_URL=http://localhost:3000
export E2E_MODERATOR_EMAIL E2E_MODERATOR_PASSWORD
pnpm --filter web e2e
unset E2E_MODERATOR_EMAIL E2E_MODERATOR_PASSWORD
```
The account journey uses unique data and creates real test records. The public
seed test is skipped in external mode. The moderator account must be registered
and granted by an operator before the run, then revoked or removed afterward;
omitting either credential skips only the moderation journey. Local harness
credentials are never used as external defaults.

If Chromium is already installed, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chrome`. Prefer Playwright's
matching browser build when available. Artifacts stay in ignored `test-results/`
and `playwright-report/` folders.
