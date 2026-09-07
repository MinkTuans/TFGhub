# Game Publishing And Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure HTML5 upload/play/moderation plus code, story/quiz, and platformer creation tools on the deployed IndieForge site.

**Architecture:** All creation modes persist bounded source data and produce a versioned HTML5 artifact under one storage abstraction. Ownership and moderator services control transitions; public play serves only approved artifacts inside a restricted iframe.

**Tech Stack:** TypeScript 6, NestJS 12/Express 5, Prisma/PostgreSQL 16, Zod, Next.js 16/React 19, Vitest, Playwright, Docker Compose/Caddy

**Spec:** `docs/superpowers/specs/2026-09-07-game-publishing-and-builders-design.md`

## Global Constraints

- ZIP upload maximum: 25 MiB compressed, 100 MiB expanded, 1,000 entries.
- Artifact storage must be durable and rooted at `GAME_STORAGE_ROOT`.
- Creator code must never execute on the server.
- Public artifacts require `reviewState=APPROVED`, `visibility=PUBLIC`, and `moderationState=CLEAR`.
- Game iframes use `sandbox="allow-scripts allow-pointer-lock"` without `allow-same-origin`.
- Existing exact-origin CSRF checks, HTTP-only session cookies, ownership rules, and private API/database ports remain intact.
- No executable/APK distribution, multiplayer, payments, AI generation, or unrelated refactors.

---

### Task 1: Domain contracts and migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260907060000_game_builds/migration.sql`
- Modify: `packages/contracts/src/games.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `GameSourceType`, `GameReviewState`, `CodeProjectInput`, `StoryProjectInput`, `PlatformerProjectInput`, `GameProjectInput`, `ReviewGameInput`, expanded `GameSummary`.
- Consumes: existing `CreateGameInput`, `UpdateGameInput`, and Prisma `Game`.

- [x] **Step 1: Add failing literal contract tests**

  Assert that `CreateGameInput` accepts each source type, story choices reject
  unknown scene targets, platform coordinates reject values outside the canvas,
  code fields are bounded, and `GameSummary` requires review/build fields.

- [x] **Step 2: Verify RED**

  Run: `pnpm --filter @indieforge/contracts test`

  Expected: FAIL because the new schemas/fields are absent.

- [x] **Step 3: Add schemas and database fields**

  Add Prisma enums `GameSourceType { UPLOAD CODE STORY PLATFORMER }` and
  `GameReviewState { DRAFT PENDING APPROVED REJECTED }`; add `sourceType`,
  `reviewState`, nullable `projectData Json`, `artifactVersion Int @default(0)`,
  nullable `reviewNote`, `submittedAt`, and `reviewedAt` to `Game`. Add matching
  SQL with explicit defaults. Implement discriminated Zod project schemas with
  literal maximums and cross-field `superRefine` checks.

- [x] **Step 4: Verify GREEN and migration**

  Run: `pnpm db:generate && pnpm --filter @indieforge/contracts test && pnpm --filter @indieforge/database test`

  Expected: all commands exit 0.

- [x] **Step 5: Commit**

  Run: `git add packages && git commit -m "feat(domain): model game sources and review state"`

### Task 2: Safe artifact compilation and storage

**Files:**
- Create: `apps/api/src/game-artifacts/artifact-types.ts`
- Create: `apps/api/src/game-artifacts/artifact-storage.ts`
- Create: `apps/api/src/game-artifacts/artifact-storage.spec.ts`
- Create: `apps/api/src/game-artifacts/code-compiler.ts`
- Create: `apps/api/src/game-artifacts/story-compiler.ts`
- Create: `apps/api/src/game-artifacts/platformer-compiler.ts`
- Create: `apps/api/src/game-artifacts/compilers.spec.ts`
- Create: `apps/api/src/game-artifacts/game-artifacts.module.ts`

**Interfaces:**
- Produces: `ArtifactStorage.install(gameId, version, files)`, `read(gameId,
  version, path)`, `compileCode`, `compileStory`, `compilePlatformer`, and
  `ArtifactFile { path, content, contentType }`.
- Consumes: project input types from Task 1.

- [ ] **Step 1: Write failing storage and compiler tests**

  Use a temporary root. Prove traversal/absolute paths are rejected, staging is
  atomically published, reads cannot escape the root, `</script>` user input
  cannot break generated markup, story choices render, and platform output
  contains bounded serialized coordinates and its keyboard/collision runtime.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter api test -- game-artifacts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure compilers and filesystem storage**

  Serialize projects with `JSON.stringify(...).replaceAll("<", "\\u003c")`.
  Install through a sibling `.staging-<uuid>` directory, `writeFile` with
  `flag:"wx"`, and atomic `rename`; validate every resolved path begins with
  the resolved artifact root plus `path.sep`.

- [ ] **Step 4: Verify GREEN**

  Run: `pnpm --filter api test -- game-artifacts && pnpm --filter api typecheck`

  Expected: all commands exit 0.

- [ ] **Step 5: Commit**

  Run: `git add apps/api/src/game-artifacts && git commit -m "feat(api): add safe game artifact compilation"`

### Task 3: Upload, owner workspace, preview, and public play API

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/configure-app.ts`
- Modify: `apps/api/src/games/games.controller.ts`
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `apps/api/src/games/public-games.controller.ts`
- Modify: `apps/api/src/games/public-games.service.ts`
- Create: `apps/api/src/games/game-content.service.ts`
- Create: `apps/api/src/games/game-content.controller.ts`
- Modify: `apps/api/src/games/games.service.spec.ts`
- Create: `apps/api/src/games/game-content.service.spec.ts`
- Modify: `apps/api/test/games.e2e-spec.ts`

**Interfaces:**
- Produces: owner `GET /games/:id`, `PUT /games/:id/project`, multipart `POST
  /games/:id/upload`, `POST /games/:id/build`, owner/moderator preview, and
  public `GET /play/:slug/*`.
- Consumes: artifact interfaces from Task 2 and domain contracts from Task 1.

- [ ] **Step 1: Write failing service/API tests**

  Prove ownership before file access, source-type matching, successful build
  increments the version, build resets approval/public visibility, upload
  rejects traversal/no-root-index/over-limit archives without replacing the
  current version, preview is owner-only, guest/auth play rules work, and
  unapproved content returns 404.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter api test && pnpm --filter api test:e2e`

  Expected: new tests fail on missing routes and behavior.

- [ ] **Step 3: Implement ZIP reader, workspace service, and content response**

  Add one pure-JavaScript streaming ZIP dependency. Validate entry names before
  extracting, reject symlinks/encryption, count expanded bytes while streaming,
  and pass validated buffers to `ArtifactStorage.install`. Set CSP,
  `X-Content-Type-Options:nosniff`, and exact MIME types on content responses.
  Allow multipart only on `/games/:id/upload`; retain origin enforcement.

- [ ] **Step 4: Verify GREEN**

  Run: `pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api typecheck && pnpm --filter api lint`

  Expected: all commands exit 0.

- [ ] **Step 5: Commit**

  Run: `git add apps/api apps/api/package.json pnpm-lock.yaml && git commit -m "feat(api): upload and serve HTML5 games"`

### Task 4: Review workflow and authorization

**Files:**
- Create: `apps/api/src/auth/roles.guard.ts`
- Create: `apps/api/src/auth/roles.guard.spec.ts`
- Create: `apps/api/src/games/moderation.controller.ts`
- Create: `apps/api/src/games/moderation.service.ts`
- Create: `apps/api/src/games/moderation.service.spec.ts`
- Modify: `apps/api/src/games/games.controller.ts`
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `apps/api/test/games.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /games/:id/submit`, `GET /moderation/games`, `POST
  /moderation/games/:id/approve`, and `POST /moderation/games/:id/reject`.
- Consumes: authenticated user roles and artifact/build fields.

- [ ] **Step 1: Write failing transition/authorization tests**

  Prove no-artifact submit fails, only an owner submits, regular users get 403,
  pending queue is role-gated, approve publishes only the pending artifact,
  reject requires a note, and concurrent/non-pending review returns conflict.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter api test && pnpm --filter api test:e2e`

  Expected: new tests fail because review APIs are absent.

- [ ] **Step 3: Implement role guard and conditional transitions**

  The guard accepts `MODERATOR`/`ADMIN`. Repository transitions use
  `updateMany({where:{id,reviewState:'PENDING'},data:...})` and require count 1.
  Approve sets `APPROVED/PUBLIC`; reject sets `REJECTED/DRAFT` with trimmed note.

- [ ] **Step 4: Verify GREEN**

  Run: `pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api typecheck && pnpm --filter api lint`

  Expected: all commands exit 0.

- [ ] **Step 5: Commit**

  Run: `git add apps/api && git commit -m "feat(api): add moderated game publishing"`

### Task 5: Creator workspace and HTML5 upload UI

**Files:**
- Modify: `apps/web/components/game-form.tsx`
- Modify: `apps/web/app/studio/page.tsx`
- Create: `apps/web/app/studio/games/[id]/page.tsx`
- Create: `apps/web/components/game-workspace.tsx`
- Create: `apps/web/components/upload-editor.tsx`
- Create: `apps/web/components/game-preview.tsx`
- Modify: `apps/web/tests/forms.test.tsx`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Produces: source-type creation, owner workspace, ZIP upload, preview, submit,
  review-state/rejection display.
- Consumes: Task 3/4 API routes and expanded contracts.

- [ ] **Step 1: Write failing component/browser tests**

  Assert source selection is submitted, Studio cards link to workspace, invalid
  ZIP errors remain visible and retryable, valid upload enables sandboxed
  preview, submit displays `Pending review`, and rejection note is visible.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter web test && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e`

  Expected: new assertions fail because workspace UI is absent.

- [ ] **Step 3: Implement minimal accessible UI**

  Use one source-specific editor under a shared status/actions shell. Upload the
  `File` with `FormData`; do not set `Content-Type` manually. Render preview as
  `<iframe sandbox="allow-scripts allow-pointer-lock">` and use API error text.

- [ ] **Step 4: Verify GREEN**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e`

  Expected: all commands exit 0.

- [ ] **Step 5: Commit**

  Run: `git add apps/web && git commit -m "feat(web): add game upload workspace"`

### Task 6: Code editor

**Files:**
- Create: `apps/web/components/code-game-editor.tsx`
- Modify: `apps/web/components/game-workspace.tsx`
- Modify: `apps/web/tests/forms.test.tsx`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Produces: editable HTML/CSS/JavaScript source, save/build, and shared preview.
- Consumes: `PUT /games/:id/project` and `POST /games/:id/build`.

- [ ] **Step 1: Write failing code-editor tests**

  Assert all three fields load saved content, failed saves preserve edits, a
  successful build refreshes the sandboxed preview, and submission uses the
  compiled revision.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter web test && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "code game"`

  Expected: tests fail because the editor is absent.

- [ ] **Step 3: Implement the editor**

  Use controlled textareas with explicit length counters and two operations:
  `Save source` then `Build preview`. Reuse the workspace status, error, preview,
  and submit controls; add no editor dependency.

- [ ] **Step 4: Verify GREEN and commit**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "code game" && git add apps/web && git commit -m "feat(web): add HTML game code editor"`

### Task 7: Story and quiz builder

**Files:**
- Create: `apps/web/components/story-game-editor.tsx`
- Modify: `apps/web/components/game-workspace.tsx`
- Modify: `apps/web/tests/forms.test.tsx`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Produces: add/remove/edit scene and choice controls plus build/preview.
- Consumes: `StoryProjectInput` and shared save/build APIs.

- [ ] **Step 1: Write failing story-builder tests**

  Assert add/remove scene, add/remove choice, duplicate scene and missing target
  validation, retained input after API error, build preview, and a branching
  browser journey that reaches the selected target scene.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter web test && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "story game"`

  Expected: tests fail because the builder is absent.

- [ ] **Step 3: Implement the story builder**

  Keep scene/choice arrays in React state with UUID keys used only by the UI;
  submit the bounded contract shape. Render native labeled fields/buttons and
  reuse save/build/preview/submit behavior.

- [ ] **Step 4: Verify GREEN and commit**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "story game" && git add apps/web && git commit -m "feat(web): add no-code story builder"`

### Task 8: 2D platformer builder

**Files:**
- Create: `apps/web/components/platformer-game-editor.tsx`
- Modify: `apps/web/components/game-workspace.tsx`
- Modify: `apps/web/tests/forms.test.tsx`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Produces: bounded canvas/player/goal/platform controls and playable preview.
- Consumes: `PlatformerProjectInput` and shared save/build APIs.

- [ ] **Step 1: Write failing platformer-builder tests**

  Assert platform add/remove, numeric boundary validation, retained values after
  errors, build preview, keyboard movement, collision landing, and goal status
  in a browser.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter web test && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "platformer game"`

  Expected: tests fail because the builder is absent.

- [ ] **Step 3: Implement the platformer builder**

  Use number/color inputs and a repeatable platform fieldset. Validate through
  `PlatformerProjectInput`, reuse shared save/build/preview/submit behavior, and
  keep physics solely in the generated iframe runtime.

- [ ] **Step 4: Verify GREEN and commit**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "platformer game" && git add apps/web && git commit -m "feat(web): add no-code platformer builder"`

### Task 9: Moderator and public player UI

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/lib/session.ts`
- Create: `apps/web/app/moderation/page.tsx`
- Create: `apps/web/components/moderation-queue.tsx`
- Modify: `apps/web/app/games/[slug]/page.tsx`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Produces: role-aware navigation, moderation queue/actions, and public player.
- Consumes: auth/me, moderation APIs, public game summary and play route.

- [ ] **Step 1: Write failing role and journey tests**

  Assert regular users never see/access moderation, moderator can preview then
  reject with a required note or approve, approval makes the game discoverable,
  and the public page embeds only the approved artifact with the exact sandbox.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter web test && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e --grep "moderation"`

  Expected: tests fail because moderator/public player UI is absent.

- [ ] **Step 3: Implement role-aware server layout and queue**

  Add an optional server session lookup that maps 401 to null without redirect.
  Use server-fetched queue data and client mutation controls. Add the public
  iframe only when the expanded public summary reports a playable artifact.

- [ ] **Step 4: Verify GREEN and commit**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e && git add apps/web && git commit -m "feat(web): add moderation and public game player"`

### Task 10: Durable deployment and release

**Files:**
- Modify: `compose.production.yml`
- Modify: `.env.production.example`
- Modify: `apps/api/Dockerfile`
- Modify: `scripts/test-deployment-config.mjs`
- Modify: `scripts/smoke-production.sh`
- Modify: `docs/deployment.md`

**Interfaces:**
- Produces: durable `game_storage` volume, `GAME_STORAGE_ROOT`, documented role
  grant/backup/restore behavior, and public release.
- Consumes: all application behavior from Tasks 1–9.

- [ ] **Step 1: Write failing deployment contract checks**

  Assert API mounts only `game_storage:/var/lib/indieforge/games`, the volume is
  declared, upload size/env is fixed, no extra host ports exist, and backup/
  restore instructions include game artifacts as well as PostgreSQL.

- [ ] **Step 2: Verify RED**

  Run: `pnpm test:deploy-config`

  Expected: FAIL because the storage volume/configuration is absent.

- [ ] **Step 3: Implement deployment configuration and runbook**

  Mount the named volume into API, set `GAME_STORAGE_ROOT` and upload limits,
  install only the runtime packages needed by ZIP handling, and document a
  tar-based artifact backup paired with the database dump plus explicit role
  grant SQL using a safely prompted email.

- [ ] **Step 4: Run release gates**

  Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm test:deploy-config && pnpm test:containers && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e && docker compose --project-name deploy-ip-preview --env-file .env.production -f compose.production.yml build`

  Expected: every command exits 0.

- [ ] **Step 5: Back up and deploy**

  Create and validate a new PostgreSQL custom-format dump and an artifact-volume
  archive, remove only the stopped one-shot migrate container, then run the
  existing project with `up -d --build --wait`. Never remove volumes.

- [ ] **Step 6: Verify the public release and commit**

  Run the full external Playwright journey at `http://161.248.81.59`, verify
  health/service/port state, then commit deployment/docs changes as
  `feat(deploy): persist published game artifacts`.
