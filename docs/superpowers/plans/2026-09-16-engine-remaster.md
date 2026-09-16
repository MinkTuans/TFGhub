# Pixel Studio implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks and explicit integration reviews. User explicitly authorizes autonomous decisions; do not ask to continue.

**Goal:** Deliver a usable pixel engine, editable published sample and detailed guide.
**Architecture:** Retain V2 canonical editor, add generic browser runtime and actual ENGINE build path; expose task-oriented UI over existing assets/history/recovery.
**Tech Stack:** Next16/React19, Nest, Prisma/PostgreSQL, engine-core TypeScript/Zod, Canvas2D, existing Vitest/Playwright.
**Spec:** `docs/superpowers/specs/2026-09-16-engine-remaster-design.md`.

## Global constraints
No creator code on API/editor host; preserve sandbox without same-origin, asset ownership/hash checks, revision idempotency and immutable publication. Preserve existing sources/data. No permission pauses for user-authorized work. No arbitrary API endpoints or schema fields. Use focused TDD, then integrated verification.

## Task 1 — Runtime (runtime worker)
Files: new `packages/engine-core/src/runtime/game-runtime.ts`, `engine-html.ts`, focused tests. Consume V2 schemas and built-in sprite data. Produce `compileEngineHtml(project, assets): string` and testable pure runtime state/events functions.
- [ ] Write red tests for movement/solid collision, collectible score and destroy, hazard health, conditional exit, restart, script diagnostics and escaped project embedding.
- [ ] Implement deterministic bounded event processing, rendering and keyboard/touch lifecycle driven solely by project data. Execute user script only game-isolated; use a worker/watchdog if feasible and explicitly bound commands.
- [ ] Verify core tests/typecheck and compiled HTML in browser. Report supported features and exact exported signatures.

## Task 2 — Template and guides (sample worker)
Files: new `packages/engine-core/src/templates/pixel-adventure.ts`, `pixel-art.ts`, tests; `docs/04-workflows/pixel-studio-guide.md`; shared web guide content/component and `/huong-dan` page. Consume V2 events/components, produce `createPixelAdventure(projectId,newId)` and `BUILTIN_PIXEL_SPRITES`.
- [ ] Build schema-valid multi-goal island game with IDs generated from provided factory and self-contained pixel artwork. Use ON_COLLECT_ITEM, collision/area conditions and COMPLETE_GAME instead of title-specific runtime logic.
- [ ] Tests parse with EngineProjectV2 and prove references/geometry/conditions support a completable path and genuine loss/restart.
- [ ] Write detailed Vietnamese step-by-step tutorial, actual script API example coordinated with runtime worker, import/export, troubleshooting, save/conflict and publish workflow. Keep guide content shareable in editor/public page. Link repository hub.

## Task 3 — Canonical operations, creation/build lifecycle (root)
Files: core `v2/mutations.ts` + tests, shared games creation contract, API game service/modules, new ENGINE artifact builder, engine revision repository/service and tests.
- [ ] Add schema-validated script/settings/replacement operations and exact inverses. Example: `dispatch({type:'commit',mutations:[{type:'script.upsert',script}]})`; deletion of referenced script must reject unless references removed atomically.
- [ ] Add template creation input with legacy-compatible default; create canonical snapshot using factory.
- [ ] Add ENGINE build path with owned canonical snapshot, bounded copied assets and HTML compiler. Preserve existing CODE/STORY/PLATFORMER/UPLOAD paths.
- [ ] Invalidate builds/review transactionally on real canonical revision changes; retain build provenance and reject raced installs with existing timestamp CAS.
- [ ] Verify owner denial, invalid/missing assets, stale revision conflicts and legacy compatibility in unit + isolated database/API checks.

## Task 4 — Beginner workspace (UI worker)
Files: studio shell/topbar/sidebar/panels/CSS, new task panels, create form/page, inspector default. Consume new canonical mutations and shared guide.
- [ ] Red UI tests: visible tasks/import/code/play/help, named template creation, understandable empty state, new controls enabled only for safe save states.
- [ ] Implement persistent task navigation, starter checklist and friendly presets; advanced raw details opt-in. Dedicated asset manager with working placement. Script editor imports .js, canonical saves and diagnostics. JSON export/import validates before replacement.
- [ ] Build/preview/publish panel uses actual API paths and acknowledged state. No fake play button or ephemeral script state. Keep editor mounted and mobile task access usable.
- [ ] Run targeted tests/typecheck, update obsolete assertions that claimed future controls must be absent.

## Task 5 — Integration and release (root + independent review)
- [ ] Integrate exports and editor built-in pixel sprite rendering; compare template preview against runtime; test loading assets and changing code.
- [ ] E2E on isolated database: create, save/reload, import/place PNG, code, preview, lose/win/restart, build/submit/approve; verify mobile touch and meaningful screenshots.
- [ ] Independent spec/code review; resolve material findings. Update current architecture/API/workflow docs.
- [ ] Build API/web and preserve rollback images; backup database+storage for planned sample/doc writes. Deploy, then create the explicitly requested sample under existing authorized owner through real APIs and approve with existing admin; never publish pre-existing drafts.
- [ ] Add new guide to admin library without modifying unrelated docs; live GET-only verification, final report with public game/editor/guide links. Mark ledger COMPLETE so stale wakeups do not replay.

## Execution ledger
- 2026-09-16: Audits completed; existing worktree clean. Design follows user's explicit autonomous authorization. Runtime absent, ENGINE build absent, scripts UI/mutations absent, and revision invalidation gap confirmed in code. Tasks 1–4 may proceed with disjoint file ownership; root owns package export integration.
