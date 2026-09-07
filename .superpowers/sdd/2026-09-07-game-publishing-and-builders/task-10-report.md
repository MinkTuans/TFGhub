# Task 10 report: durable game artifact deployment

## Delivered

- Added the durable `game_storage` named volume and mounted it only into the
  single API service at `/var/lib/indieforge/games`; PostgreSQL, web, migration,
  and Caddy do not mount it or publish new ports.
- Set the fixed `GAME_STORAGE_ROOT` and `GAME_UPLOAD_MAX_BYTES=26214400`
  production environment. The API now rejects a mismatched deployment value at
  startup rather than silently accepting a different upload ceiling.
- Seeded the runtime image's artifact directory as `node:node`, which lets
  Docker initialize a fresh named volume with an API-writable root while the
  API itself remains non-root.
- Extended deployment contracts for the volume, API-only mount, fixed limit,
  private-port invariant, runtime ownership, paired recovery runbook, and role
  grant instructions.
- Updated the production smoke journey to create a CODE game, save/build it,
  and prove `index.html` exists in the API-mounted artifact volume.
- Documented a paired database/custom-dump and artifact/tar backup, a typed
  confirmation restore that clears artifact *contents* but never removes the
  named volume, and an operator-prompted `MODERATOR` grant using psql variable
  quoting. The runbook also records all four persistent volumes.
- Kept legacy `PUBLIC` + `CLEAR` rows discoverable by backfilling only their
  review state to `APPROVED`. The later readiness migration still leaves their
  `artifactReady` value false, so no nonexistent historical artifact is ever
  played. A read-only check of the current production database found only two
  `DRAFT/CLEAR` rows, so there are no current legacy public rows to backfill.
- Closed the two Task 8 review minors: platformer-focused component/browser
  coverage directly asserts the exact iframe sandbox, and contracts now cover
  out-of-bounds canvas, player, and goal values in addition to platform bounds.

## RED / GREEN record

### RED

1. `pnpm test:deploy-config` failed because `GAME_STORAGE_ROOT` was undefined
   in the rendered API service.
2. `pnpm test:containers` failed because the API runtime image did not create
   a node-owned artifact directory for a fresh named volume.
3. The focused content-service test failed with
   `uploadLimitFromEnvironment is not a function`, proving the fixed Compose
   upload setting was not yet consumed by application startup.

### GREEN

- Added the named volume/environment contract and API-only mount.
- Added runtime directory initialization and a fixed-value startup validator.
- Verified an independently created temporary named volume is writable by the
  image's `node` user at the mounted artifact root; that temporary volume was
  removed after the check.

## Verification

Fresh successful commands after the final changes:

```text
pnpm test:deploy-config
deployment configuration valid

pnpm test:containers
container contracts valid

node scripts/test-restore-runbook.mjs
6 restore safety checks passed

pnpm --filter @indieforge/database test
1 passed

pnpm --filter @indieforge/contracts test
13 passed

pnpm --filter api exec vitest run src/games/game-content.service.spec.ts --reporter=dot
36 passed

pnpm --filter api typecheck && pnpm --filter api lint
exit 0

pnpm --filter web test -- forms.test.tsx
31 passed

pnpm --filter web typecheck && pnpm --filter web lint
exit 0

docker compose --project-name deploy-ip-preview --env-file .env.production -f compose.production.yml build api
exit 0
```

Additional runtime checks used the freshly built `indieforge-api` image:

- a new temporary named volume accepted a `touch` from `node` at
  `/var/lib/indieforge/games`;
- `yauzl` imports from the API package working directory, confirming the ZIP
  parser remains present in the runtime image;
- `git diff --check` completed with clean output.

The non-Chrome focused browser invocation encountered the environment's absent
Playwright managed browser binary. It did not exercise application code; the
prescribed Chrome-overridden full browser release gate remains for the release
owner.

## Scope and safety notes

- This task did not stop, restart, or modify the currently running production
  containers or their persistent volumes. It did build a replacement API image
  for runtime verification only.
- No deployment was performed. The release owner must take the documented
  paired backup, run the full release gates, remove only the stopped `migrate`
  container, and then start the existing Compose project.
