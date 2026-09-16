# Phase 1 Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned, backward-compatible engine core with safe draft revisions, immutable asset/build provenance, and release publication that is independent from ongoing edits.

**Architecture:** A new pure `@indieforge/engine-core` package owns canonical schemas, validation, component definitions, deterministic identity, and legacy adapters. PostgreSQL stores project/revision/asset/build/release lifecycle metadata while immutable binaries remain in game storage; legacy CODE/UPLOAD and existing artifacts continue unchanged.

**Tech Stack:** TypeScript, Zod, NestJS 12, Prisma/PostgreSQL, Vitest, Playwright, existing immutable filesystem storage and sandboxed iframe

**Spec:** `docs/superpowers/specs/2026-09-08-phase-1-engine-core-design.md`

## Global Constraints

- Do not add the large editor UI, Phaser, React Flow, or production rollout.
- Do not edit historical migrations, remove legacy columns, or rebuild legacy artifacts.
- CODE and UPLOAD remain legacy lanes.
- Future schemas are read-only and preserve raw input; never fall back to defaults.
- All new writes are owner-scoped and use client base revisions where applicable.
- A draft save/build must never remove or replace the current published release.
- Asset binaries remain outside PostgreSQL and are addressed by stable asset ID plus immutable SHA-256 hash.
- Preserve the existing iframe sandbox without `allow-same-origin`; change CSP only after the spike and a separately reviewed decision.
- Every task follows RED -> minimal GREEN -> focused regression -> commit, with no drive-by refactor.

---

### Task 1: Engine-core package, stable IDs, and canonical schema

**Goal:** Establish the dependency-free domain boundary and canonical v1 project/component schemas.

**Files:**
- Create: `packages/engine-core/package.json`
- Create: `packages/engine-core/tsconfig.json`
- Create: `packages/engine-core/src/stable-id.ts`
- Create: `packages/engine-core/src/project-schema.ts`
- Create: `packages/engine-core/src/component-registry.ts`
- Create: `packages/engine-core/src/read-result.ts`
- Create: `packages/engine-core/src/index.ts`
- Create: `packages/engine-core/src/project-schema.test.ts`
- Create: `packages/engine-core/src/stable-id.test.ts`
- Modify: `pnpm-lock.yaml`

Do not modify either Dockerfile by default. Add an engine-core manifest-copy
line only if an actual clean image build fails to resolve the new workspace
package, and retain the failing/passing build evidence in the Task 1 report.

**Database/API impact:** None. Adds a workspace package consumed later by contracts/API.

**Tests first:** UUID validation/generation boundaries, canonical valid fixture, duplicate IDs, dangling parent/scene/asset references, parent cycles, invalid component properties, finite-number and resource-limit rejection, malformed/future-schema discriminated read results.

- [ ] Write UUID and canonical-schema tests, including a future document whose exact raw object is returned without normalization.
- [ ] Run `pnpm --filter @indieforge/engine-core test`; verify RED because package exports are absent.
- [ ] Implement the minimal stable-ID helpers, schemas, read-result union, and twelve component registry entries.
- [ ] Run package tests and typecheck; verify GREEN.
- [ ] Run contracts/API/web typechecks to prove package and Docker manifest-copy integration does not break existing workspaces.
- [ ] Commit only Task 1 files.

**Acceptance criteria:** Valid v1 round-trips; invalid/future documents cannot become writable values; every component owns defaults/schema/version/runtime-handler key; no React/Nest/Prisma/runtime-engine dependency enters engine-core.

**Rollback/risk:** Remove the unused package and lockfile entry. Main risks are schema overreach and browser-incompatible crypto APIs; stable-ID APIs must be usable in Node and modern browsers. Dockerfiles remain unchanged unless a clean container build proves a resolution change is necessary.

---

### Task 2: Event schema and semantic validation

**Goal:** Freeze the portable trigger/condition/action model before adapters or persistence depend on it.

**Files:**
- Create: `packages/engine-core/src/event-schema.ts`
- Create: `packages/engine-core/src/validation.ts`
- Create: `packages/engine-core/src/event-schema.test.ts`
- Modify: `packages/engine-core/src/project-schema.ts`
- Modify: `packages/engine-core/src/index.ts`

**Database/API impact:** None.

**Tests first:** One test per trigger/action; stable nested condition IDs; maximum depth/counts; missing scene/object/component/prefab/asset targets; variable scope/type mismatches; valid cycles as diagnostics; arbitrary code fields rejected.

- [ ] Write the complete failing event-schema and semantic-validation table tests.
- [ ] Run the exact event test file and verify RED.
- [ ] Implement discriminated trigger/condition/action unions and bounded semantic validation.
- [ ] Run engine-core tests/typecheck and verify GREEN.
- [ ] Add serialization round-trip tests proving vendor UI/runtime state cannot enter the canonical document.
- [ ] Commit only Task 2 files.

**Acceptance criteria:** Every event node is stable and versioned; all target references are typed and validated; actions are non-empty; cycles are reported but do not corrupt parsing.

**Rollback/risk:** Revert event files before any persisted v1 data exists. Main risk is prematurely broad behavior; keep only spec-listed triggers, conditions, and actions.

### Checkpoint A: Domain review

Review package boundaries, schema limits, future-schema behavior, event semantics, and public exports. Do not begin adapters until this checkpoint is accepted.

---

### Task 3: Deterministic legacy adapters and golden fixtures

**Goal:** Read STORY/PLATFORMER v0 deterministically without changing CODE/UPLOAD or old artifacts.

**Files:**
- Create: `packages/engine-core/src/adapters/story-v0.ts`
- Create: `packages/engine-core/src/adapters/platformer-v0.ts`
- Create: `packages/engine-core/src/adapters/index.ts`
- Create: `packages/engine-core/src/adapters/fixtures/story-v0.json`
- Create: `packages/engine-core/src/adapters/fixtures/story-v1.golden.json`
- Create: `packages/engine-core/src/adapters/fixtures/platformer-v0.json`
- Create: `packages/engine-core/src/adapters/fixtures/platformer-v1.golden.json`
- Create: `packages/engine-core/src/adapters/adapters.test.ts`
- Modify: `packages/engine-core/src/index.ts`

**Database/API impact:** None; pure adapters only.

**Tests first:** RFC UUIDv5 golden vector; repeated conversion byte identity; distinct games produce distinct IDs; Story choices map to stable events; Platformer player/goal/platform mapping; invalid legacy diagnostics; explicit CODE/UPLOAD rejection. Identity derivation prefers immutable legacy identifiers. Where none exist, it uses a stable content fingerprint scoped by the deterministic parent identity; array index is the final fallback only when identical siblings cannot otherwise be distinguished.

- [ ] Write failing adapter/golden tests with the permanent namespace UUID asserted literally.
- [ ] Run adapter tests and verify RED.
- [ ] Implement deterministic UUIDv5 identities and minimal STORY/PLATFORMER adapters using immutable legacy identity first, stable content fingerprint plus parent identity second, and index only as the last fallback.
- [ ] Generate expected fixtures through reviewed deterministic serialization, then inspect the complete fixture diff.
- [ ] Run all engine-core tests/typecheck twice and assert identical outputs.
- [ ] Commit only Task 3 files.

**Acceptance criteria:** The same `gameId + legacy source` always yields byte-identical canonical JSON; no random identity occurs in adapters; immutable identity or parent-scoped content fingerprints prevent unrelated reorder from changing IDs wherever legacy data permits; index is used only for otherwise indistinguishable siblings; invalid/future data remains unmodified; CODE/UPLOAD never enter conversion. Once materialized and persisted, canonical IDs are frozen and are never regenerated from later legacy reorder.

**Rollback/risk:** Pure package revert. Truly indistinguishable duplicate legacy siblings may require index as the final tie-breaker during first materialization; tests must prove persisted canonical IDs are never regenerated or remapped afterward.

---

### Task 4: Additive Prisma and PostgreSQL lifecycle schema

**Goal:** Add project/revision/asset/build/release tables and exact database constraints without migrating content.

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_engine_core_phase_1/migration.sql`
- Modify: `packages/database/prisma/schema.test.ts`
- Create: `packages/database/prisma/engine-core.integration.test.ts`
- Modify: `packages/database/src/index.ts`

**Database/API impact:** Additive models/enums/indexes only. Adds nullable `Game.currentPublishedReleaseId`; keeps every legacy field.

**Tests first:** Schema presence; unique game/project; unique project/revision; build source XOR check; asset/hash composite FK; current release composite FK; cross-game pointer rejection; partial unique PUBLISHED release per game; history rows allowed; legacy rows accepted unchanged.

- [ ] Write failing schema contract tests for every model, FK, check, and partial index.
- [ ] Add a real-PostgreSQL migration test that inserts legacy rows and exercises cross-game/current-release constraints.
- [ ] Run database tests and verify RED.
- [ ] Add Prisma models and one new SQL migration; do not modify prior migration directories.
- [ ] Generate Prisma client and run database tests/typecheck.
- [ ] Apply migration to a disposable PostgreSQL database and run `prisma migrate status` plus constraint tests.
- [ ] Inspect generated SQL and commit only Task 4 files.

**Acceptance criteria:** One Game has zero/one EngineProject; many historical releases remain; at most one PUBLISHED row exists per Game; the current pointer cannot reference another Game; no standalone unique constraint is placed on `currentPublishedReleaseId`; legacy data remains valid.

**Rollback/risk:** Application rollback leaves unused additive tables. No down/drop migration is executed. Prisma cannot fully express partial/deferrable SQL constraints, so schema tests must prevent drift.

### Checkpoint B: Persistence schema review

Review generated Prisma relations, raw SQL constraints, delete behavior, migration compatibility, and disposable-DB evidence before any endpoint writes new rows.

---

### Task 5: Revision persistence and client CAS

**Goal:** Materialize/read canonical projects and save immutable revisions without stale-tab overwrite.

**Files:**
- Create: `packages/contracts/src/engine-projects.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Create: `apps/api/src/engine-projects/engine-projects.controller.ts`
- Create: `apps/api/src/engine-projects/engine-projects.service.ts`
- Create: `apps/api/src/engine-projects/engine-projects.repository.ts`
- Create: `apps/api/src/engine-projects/engine-projects.module.ts`
- Create: `apps/api/src/engine-projects/engine-projects.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/engine-projects.e2e-spec.ts`

**Database/API impact:** Adds owner-only project read/materialize/save APIs with `baseRevision`; inserts revisions and reference rows transactionally; returns 409 on stale base.

**Tests first:** Owner/non-owner; legacy materialization; future read-only response; successful revision 0→1; two-tab CAS conflict; no partial reference rows; pinned migration revision; latest-100 compaction while preserving pinned/build-referenced revisions.

- [ ] Add failing contracts for supported/read-only project responses, save input, conflict response, and revision summary.
- [ ] Add failing service tests with an abstract repository, including exact CAS arguments and no fallback behavior.
- [ ] Add failing real-DB test with two concurrent saves using the same base revision.
- [ ] Implement minimal controller/service/repository transactions following existing Nest module patterns.
- [ ] Implement best-effort post-save compaction in a separate transaction.
- [ ] Run contracts, engine-core, API unit/E2E, real-DB, typecheck, and lint checks.
- [ ] Commit only Task 5 files.

**Acceptance criteria:** A stale writer cannot overwrite; a canonical revision and all referenced assets commit together; future schemas are read-only; save never touches legacy publication fields/current release.

**Rollback/risk:** Disable new routes and leave additive rows. Risk is whole-document storage growth; hard latest-100 unreferenced retention is mandatory before enabling autosave clients.

---

### Task 6: Asset storage, lifecycle, and reference snapshots

**Goal:** Store validated immutable asset bytes and protect every revision/build reference through tombstone and GC.

**Files:**
- Create: `packages/contracts/src/game-assets.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/game-assets/asset-types.ts`
- Create: `apps/api/src/game-assets/asset-storage.ts`
- Create: `apps/api/src/game-assets/asset-storage.spec.ts`
- Create: `apps/api/src/game-assets/game-assets.controller.ts`
- Create: `apps/api/src/game-assets/game-assets.service.ts`
- Create: `apps/api/src/game-assets/game-assets.repository.ts`
- Create: `apps/api/src/game-assets/game-assets.module.ts`
- Create: `apps/api/src/game-assets/game-assets.service.spec.ts`
- Modify: `apps/api/src/configure-app.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/game-assets.e2e-spec.ts`

**Database/API impact:** Adds owner-only upload/list/read/rename/tombstone APIs; uses `UPLOADING/READY/TOMBSTONED/GC_PENDING`; no immediate DELETE semantics.

**Tests first:** Owner guard before buffering; MIME/magic mismatch, size/dimensions; path/symlink safety; atomic install; lost-response reconciliation; cross-project references; tombstone blocks new use; revision/build references block GC; `GameBuildAsset.contentHash` differs from current claims and DB rejects mismatch.

- [ ] Write failing storage and lifecycle service tests using temporary roots.
- [ ] Write failing HTTP and real-DB composite-hash/reference tests.
- [ ] Implement immutable storage and upload reservation/finalization/reconciliation.
- [ ] Implement metadata APIs and tombstone-only delete behavior.
- [ ] Implement guarded GC that rechecks reference rows in its claim transaction before removing bytes.
- [ ] Run asset, API, database, security, typecheck, and lint suites.
- [ ] Commit only Task 6 files.

**Acceptance criteria:** Projects contain only asset IDs; build references record exact content hash; no referenced byte can be removed; retry after uncertain upload converges safely.

**Rollback/risk:** Disable asset routes and retain bytes/rows. Never run bulk physical deletion during rollback. Distributed DB/filesystem commit and crafted media are principal risks.

### Checkpoint C: Draft and asset review

Review CAS behavior, retention SQL, ownership, storage recovery, tombstone/GC proofs, and asset hash provenance before builds consume the new data.

---

### Task 7: Immutable build lifecycle

**Goal:** Create build records pinned to exact revisions and asset hashes without affecting public play.

**Files:**
- Create: `packages/contracts/src/game-builds.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/game-builds/game-builds.controller.ts`
- Create: `apps/api/src/game-builds/game-builds.service.ts`
- Create: `apps/api/src/game-builds/game-builds.repository.ts`
- Create: `apps/api/src/game-builds/game-builds.module.ts`
- Create: `apps/api/src/game-builds/game-builds.service.spec.ts`
- Modify: `apps/api/src/game-artifacts/artifact-types.ts`
- Modify: `apps/api/src/game-artifacts/artifact-storage.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/game-builds.e2e-spec.ts`

**Database/API impact:** Adds owner-only create/status endpoints; state transitions QUEUED/BUILDING/READY/FAILED/CANCELLED; build manifest includes source revision and asset ID/hash/path.

**Tests first:** Owner-only build; source revision is immutable; every GameBuildAsset records the exact asset ID and content hash selected by that revision; assets that are missing, non-ready, tombstoned, cross-project, or whose hash no longer matches are rejected; legal and illegal build transitions; artifact/storage failure; lost-commit reconciliation; parallel builds receive distinct IDs; the published release pointer remains unchanged.

- [ ] Write failing build contract and state-machine tests.
- [ ] Write failing storage/provenance and real-DB transition tests.
- [ ] Implement build creation transaction and minimal state-transition service without a Phaser runtime.
- [ ] Add immutable manifest/hash finalization and reconciliation.
- [ ] Prove legacy artifacts are not selected or rebuilt by new-engine build code.
- [ ] Run build, artifact, API E2E, typecheck, and lint suites.
- [ ] Commit only Task 7 files.

**Acceptance criteria:** Every READY build identifies exactly one source revision and exact asset hashes; failures leave current published release untouched; no arbitrary creator code executes server-side.

**Rollback/risk:** Stop new build endpoints; retain immutable rows/artifacts. Build workers remain in-process/synchronous unless a separately reviewed worker design is added.

---

### Task 8: Release, moderation, publication, and rollback lifecycle

**Goal:** Publish reviewed immutable builds while edits/builds continue privately.

**Files:**
- Create: `packages/contracts/src/game-releases.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/game-releases/game-releases.controller.ts`
- Create: `apps/api/src/game-releases/game-releases.service.ts`
- Create: `apps/api/src/game-releases/game-releases.repository.ts`
- Create: `apps/api/src/game-releases/game-releases.module.ts`
- Create: `apps/api/src/game-releases/game-releases.service.spec.ts`
- Modify: `apps/api/src/games/public-games.service.ts`
- Modify: `apps/api/src/games/game-content.service.ts`
- Modify: `apps/api/src/games/moderation.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/game-releases.e2e-spec.ts`

**Database/API impact:** Adds owner submit, moderator/admin review, and admin-only rollback. Public resolution uses the current release/build pointer for engine games while retaining the legacy branch.

**Tests first:** Authorization matrix; READY-only submission; stale/foreign build rejection; atomic approve; partial unique enforcement under concurrent moderators; old PUBLISHED→SUPERSEDED; reject leaves public release; draft save/build leaves public release; admin-only reasoned rollback creates history; quarantine/access gates; cross-game pointer rejection.

- [ ] Write failing state-machine and authorization tests.
- [ ] Write failing real-DB concurrent publication and composite-pointer tests.
- [ ] Implement submit/review/publish transactions with no filesystem work inside publication.
- [ ] Implement public resolution branch and admin rollback-as-new-release.
- [ ] Run legacy moderation/play tests plus new release unit/E2E/DB suites.
- [ ] Verify no project document enters public or moderation DTOs.
- [ ] Commit only Task 8 files.

**Acceptance criteria:** Exactly one PUBLISHED row and one matching current pointer per game; all history remains; editing/building cannot unpublish; public bytes resolve from the reviewed build; rollback is audited and ADMIN-only.

**Rollback/risk:** Feature-switch public resolution back to legacy fields while preserving new rows. Mixed legacy/engine public lookup and circular delete behavior require explicit database tests.

### Checkpoint D: Build and release review

Review artifact provenance, state transitions, moderation concurrency, public authorization, release history, and rollback behavior before changing any CSP or declaring integration complete.

---

### Task 9: Sandbox/CSP asset-loading vertical spike

**Goal:** Measure asset-loading behavior under the current capability route and CSP before proposing any policy change.

**Files:**
- Create: `apps/api/test/fixtures/engine-asset-spike/index.html`
- Create: `apps/api/test/fixtures/engine-asset-spike/module.js`
- Create: `apps/api/test/fixtures/engine-asset-spike/project.json`
- Add small binary fixtures under: `apps/api/test/fixtures/engine-asset-spike/assets/`
- Create: `apps/web/e2e/engine-asset-sandbox.spec.ts`
- Modify only if evidence requires a separate reviewed change: `apps/api/src/games/game-content.controller.ts`

**Database/API impact:** None by default. The spike uses test artifacts and existing signed capabilities.

**Tests first:** Relative image/audio/CSS/module load; fetch blocked; no host cookie/DOM/localStorage access; null origin; load before and after five-minute expiry with a controllable clock; new draft/build does not revoke an already published build capability; forged/cross-build capability denial.

- [ ] Add the artifact fixture and failing/characterization browser tests without changing CSP.
- [ ] Run the tests through the production-like reverse-proxy path.
- [ ] Record observed outcomes in the spec/test names and classify required versus optional loading mechanisms.
- [ ] If current CSP supports the approved inline-manifest/relative-asset strategy, make no CSP change.
- [ ] If it does not, stop and submit a narrowly scoped CSP/capability-renewal design for separate approval rather than widening policy in this task.
- [ ] Commit fixtures/tests and evidence only.

**Acceptance criteria:** The repository has executable evidence for every supported asset-loading primitive and expiry behavior; `allow-same-origin` remains absent; no speculative CSP widening occurs.

**Rollback/risk:** Test-only fixtures are removable. Browser differences, media autoplay, and five-minute test duration require deterministic clock/server-token injection rather than sleeps.

---

### Task 10: Integration, migration rehearsal, and regression gate

**Goal:** Prove the Phase 1 vertical lifecycle and all legacy behavior without production rollout.

**Files:**
- Create: `apps/api/test/engine-core-lifecycle.e2e-spec.ts`
- Create: `scripts/test-engine-core-migration.mjs`
- Create: `scripts/test-engine-core-restore.mjs`
- Modify: `package.json`
- Modify: `scripts/test-container-contract.mjs`
- Modify: `docs/development.md`
- Modify: `docs/api/foundation.md`
- Modify: `docs/deployment.md`
- Modify relevant existing legacy tests only for additive response compatibility.

**Database/API impact:** No new schema beyond Task 4. Exercises mixed legacy/new rows, forward migration, backup/restore, and API restart persistence.

**Tests first:** Create project→save revision→reload→upload asset→save asset reference→build→submit→approve→public play; save/build newer draft while old release stays playable; reject; admin rollback; stale two-tab save; future-schema denial; tombstone/GC; API restart; legacy UPLOAD/CODE/STORY/PLATFORMER end-to-end.

- [ ] Write the full lifecycle and mixed-version failing tests before integration fixes.
- [ ] Run contracts/engine-core/database/API unit and E2E suites; fix only Phase 1 integration defects.
- [ ] Run web unit/browser suites, including sandbox characterization.
- [ ] Run typecheck, lint, production builds, container/deployment contracts.
- [ ] Rehearse additive migration against a copied pre-Phase-1 database and validate row/artifact checksums.
- [ ] Rehearse DB plus complete game-storage restore in an isolated namespace.
- [ ] Run the entire gate again from a clean checkout and capture exact counts/results.
- [ ] Request independent code review; resolve Critical/Important findings with focused TDD cycles.
- [ ] Commit Task 10 changes and verification documentation. Do not rollout production.

**Acceptance criteria:** All specified lifecycle and legacy journeys pass; worktree is reproducible from a clean checkout; migration and restore evidence is recorded; no Critical/Important review finding remains; production is unchanged.

**Rollback/risk:** No production state exists to roll back. Delete the disposable DB/storage namespace after checks. Any migration, sandbox, or compatibility uncertainty blocks Phase 1 completion rather than being waived.

### Checkpoint E: Phase 1 completion review

Review changed files, database/API diff, exact test evidence, migration/restore artifacts, security conclusions, and remaining risks. A separate explicit approval is required before any production rollout or Phase 2 editor work.
