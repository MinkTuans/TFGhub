# Unified Game Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace type-selected authoring with one versioned, autosaving, data-driven Game Studio while preserving all legacy games and immutable public releases.

**Architecture:** `EngineProjectRevision.document` is the sole authoring source of truth. A closed `EngineProjectV2` schema, typed mutation batches, a reducer-based editor, Canvas2D renderer/runtime, immutable assets/builds/releases, and explicit legacy adapters are introduced in dependency order; no Scene/Object/Component write tables are added.

**Tech Stack:** TypeScript, Zod, React 19, Next.js 16, Canvas2D, NestJS 12, Prisma/PostgreSQL, IndexedDB, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-09-unified-game-studio-design.md`

## Global constraints

- Tasks 1–5 and commits `cd87a48`, `5c6b635`, `d19f26f`, `48df997`, and `d0de2ea` remain backward-compatible.
- `EngineProjectRevision.document` is the only writable source for scene/object/component/event/module authoring data.
- Existing `UPLOAD`, `CODE`, `STORY`, and `PLATFORMER` routes, editors, artifacts, and public play behavior remain available.
- `EngineProjectV1` stays readable with unchanged semantics; V2 is additive and V1-to-V2 conversion preserves every existing stable ID.
- New engine games use additive `GameSourceType.ENGINE`; no legacy row is retyped automatically.
- No Phaser, React Flow, Redux, Zustand, Monaco, or other heavy dependency is added without a separately reviewed evidence-based decision.
- No creator script executes in the API, database process, build validator, or moderation service.
- Public play resolves an immutable approved build, never the draft head.
- No fake canvas, dead button, placeholder endpoint, browser alert, or production demo-data branch is permitted.
- Every task starts with a read-only audit of its listed consumers, writes a focused failing test, proves RED for the intended behavior, implements minimal GREEN, runs focused regression plus Task 1–5 compatibility gates, requests review at the named checkpoint, and commits only task files.
- Any schema/database change is additive; historical migrations are never edited.

## Dependency map

```text
6A scene/component schema
└─ 6B event schema
   └─ 6C module/script schema
      └─ 6D aggregate V2 reader
├─ 7 V1→V2 compatibility
├─ 8 ENGINE database discriminator
└─ 9 atomic unified creation
   └─ 10 typed mutation protocol/API
      └─ 11 Studio store + recovery
         ├─ 12 Studio shell
         ├─ 13 scene/layer operations
         └─ 14 object/component operations
            ├─ 15 Canvas2D renderer
            ├─ 16 canvas interaction/history
            └─ 17 hierarchy/inspector/asset-drop boundary
               ├─ 18 asset storage lifecycle
               └─ 19 Asset Manager UI
                  ├─ 19A map/character/camera tools
                  ├─ 19B UI/audio tools
                  ├─ 20 variables/dialogue
                  ├─ 21 event V2 + validation
                  ├─ 22 visual event editor
                  ├─ 23 mini-game contracts
                  ├─ 24 Quiz/Puzzle modules
                  ├─ 24A Memory/DragDrop/Reaction modules
                  ├─ 25 script model/code editor
                  └─ 26 sandbox bridge
                     ├─ 27 unified Canvas2D runtime
                     └─ 28 preview/debug/validation
                        ├─ 29 immutable build lifecycle
                        ├─ 30 release/publish lifecycle
                        └─ 31 mixed-game E2E and final regression
```

## Requirement traceability

| Requirement group | Owning tasks |
| --- | --- |
| Unified creation, optional templates, no type gate, legacy compatibility | 7–9, 12, 31 |
| Canonical Scene/Layer/Object/Component/Asset/Event model | 6A–6D, 10, 13–14, 18 |
| Autosave, CAS, optimistic edits, undo/redo, recovery | 10–11, 13–17, 31 |
| Desktop IDE shell, dark TFG UX, panels, shortcuts, notifications | 12, 16–17 |
| Real canvas, drag/drop, hierarchy, inspector, grid/layers | 15–17 |
| Asset library, upload security, preview, dependencies, GC | 18–19 |
| Map/tile/collision, characters, camera, UI and audio | 19A–19B |
| Story, dialogue, choices, variables and quests | 20–22 |
| Expanded event language and visual authoring | 6B, 21–22, 27 |
| Quiz, Puzzle, Memory, Drag-and-Drop and Reaction modules | 6C, 23–24A, 27 |
| Code authoring and sandboxed Script API | 6C, 25–27 |
| Unified data-driven runtime, preview, debug and validation | 15, 27–28 |
| Immutable build, review, publication and rollback | 29–30 |
| Mixed-game acceptance journey, performance, security and all legacy regressions | 31 |

Scene/Object/Component/Event/Script CRUD requirements are logical API
operations carried by the typed mutation batch route. They intentionally do
not become independent relational CRUD resources or separate sources of truth.

---

### Task 6A: V2 scene, layer, object, and component schema

**Depends on:** Task 5.

**Scope:** Define V2 spatial/domain structures without changing V1 or implementing editor/runtime behavior.

**Files:**
- Create: `packages/engine-core/src/v2/scene-schema.ts`
- Create: `packages/engine-core/src/v2/scene-schema.test.ts`
- Create: `packages/engine-core/src/v2/component-registry.ts`
- Create: `packages/engine-core/src/v2/component-registry.test.ts`

**Data/schema:** Scene intent, dimensions/background, ordered WORLD/UI/COLLISION layers, hierarchical objects, render/lock/visibility state, and all approved component property schemas. Component definitions retain metadata-only runtime handler keys and browser-safe migrations.

**API/frontend:** None.

**TDD and verification:**

- [ ] Audit V1 components and all requested Player/NPC/Item/Map/Trigger/UI/Audio/Camera properties; define exact reusable component composition boundaries in the RED test table.
- [ ] RED-test finite geometry, layer/parent references, cycles, component compatibility, asset references, defaults, limits, unknown fields, and absence of storage/editor state.
- [ ] Implement focused schemas and contextual validation without changing V1 parsing output.
- [ ] Run all Task 1 component/project tests, typecheck, build, and lint.
- [ ] Commit `feat(engine): define v2 scene model`.

**Done when:** Every required Scene/Layer/Object/Component datum has one canonical typed location and no object role needs database columns or a game-type branch.

### Task 6B: V2 event and control-flow schema

**Depends on:** Task 6A.

**Scope:** Freeze the complete portable visual-event vocabulary and budgets before aggregate V2 or UI/runtime work.

**Files:**
- Create: `packages/engine-core/src/v2/event-schema.ts`
- Create: `packages/engine-core/src/v2/event-validation.ts`
- Create: `packages/engine-core/src/v2/event-schema.test.ts`

**Data/schema:** Approved triggers, conditions, actions, sequence, delay, branch, and bounded repeat. Custom nodes contain registered metadata keys/config only; script actions contain script IDs only.

**API/frontend:** None.

**TDD and verification:**

- [ ] Audit V1 event semantics and enumerate the exact V1-to-V2 mapping.
- [ ] RED-test every node, stable nested IDs, reference types, value types, depth/children/step/delay/repeat budgets, non-empty actions, arbitrary code/function rejection, and cycle diagnostics without parser crash.
- [ ] Implement discriminated unions and semantic validators without modifying V1 exports.
- [ ] Run all Task 2 tests unchanged plus V2 tests/typecheck/build/lint.
- [ ] Commit `feat(engine): define v2 visual events`.

**Done when:** V2 event JSON is closed, portable, bounded, and complete for later visual authoring/runtime tasks.

### Task 6C: V2 mini-game and script resource schemas

**Depends on:** Task 6B.

**Scope:** Freeze data contracts only; do not implement mini-game play, editor, or script execution.

**Files:**
- Create: `packages/engine-core/src/v2/module-schema.ts`
- Create: `packages/engine-core/src/v2/script-schema.ts`
- Create: `packages/engine-core/src/v2/module-schema.test.ts`
- Create: `packages/engine-core/src/v2/script-schema.test.ts`

**Data/schema:** Quiz, Puzzle, Memory, Drag-and-Drop, and Reaction definitions with typed inputs/results/rewards; stable script resources with JavaScript source, declared capabilities, and Scene/Object/Event attachments. Unknown module types and executable function fields are rejected.

**API/frontend:** None.

**TDD and verification:**

- [ ] RED-test config/result bounds for all five approved types, registry keys, stable IDs, attachments, script size/language/capabilities, cross-references, and rejection of unknown module types.
- [ ] Implement strict schemas without evaluating source or importing Node APIs.
- [ ] Verify browser-safe engine-core build and no `eval`/`Function`/dynamic script import.
- [ ] Commit `feat(engine): define v2 module resources`.

**Done when:** V2 can serialize approved mini-games and script references without embedding executable values or claiming unimplemented modules.

### Task 6D: Aggregate EngineProjectV2 schema and reader

**Depends on:** Tasks 6A, 6B, and 6C.

**Scope:** Assemble and close the complete V2 document, global semantic validation, limits, and reader branch.

**Files:**
- Create: `packages/engine-core/src/v2/project-schema.ts`
- Create: `packages/engine-core/src/v2/project-schema.test.ts`
- Modify: `packages/engine-core/src/read-result.ts`
- Modify: `packages/engine-core/src/index.ts`

**Data/schema:** `schemaVersion: 2`; stable scenes, layers, objects, components, variables, events, mini-games, scripts, asset IDs, grid/camera/settings. Editor-only state is rejected by strict schemas.

**Interfaces:**

```ts
type EngineProjectV2 = z.infer<typeof EngineProjectV2>;
type ReadEngineProjectResult =
  | { status: 'SUPPORTED'; project: EngineProjectV1 | EngineProjectV2 }
  | { status: 'INVALID'; raw: unknown; diagnostics: string[] }
  | { status: 'UNSUPPORTED_FUTURE_SCHEMA'; raw: unknown; schemaVersion: number };
function readEngineProject(input: unknown): ReadEngineProjectResult;
```

**API/frontend:** None.

**TDD and verification:**

- [ ] Audit V1 canonical normalization, V2 sub-schema exports, global IDs, and Task 5 readers.
- [ ] Add table tests for every V2 field, stable-ID uniqueness across all namespaces, dangling layer/parent/asset/module/script references, finite geometry, resource bounds, and rejection of React/editor/vendor state.
- [ ] Run `pnpm --filter @indieforge/engine-core exec vitest run src/v2/project-schema.test.ts`; expect RED because V2 exports do not exist.
- [ ] Implement aggregate project schema, cross-domain semantic validation, and V2 reader branch without modifying `EngineProjectV1`.
- [ ] Run engine-core tests twice, typecheck, build, and direct lint; verify deterministic normalization and all Task 1–3 tests remain green.
- [ ] Commit `feat(engine): assemble engine project v2`.

**Done when:** V1 and V2 are independently readable; future versions remain raw/read-only; V2 is closed enough that later tasks add behavior without silently changing its serialized shape.

### Task 7: Stable V1-to-V2 upgrade adapter

**Depends on:** Task 6D.

**Scope:** Pure deterministic conversion only; no database writes.

**Files:**
- Create: `packages/engine-core/src/v2/upgrade-v1.ts`
- Create: `packages/engine-core/src/v2/upgrade-v1.test.ts`
- Create: `packages/engine-core/src/v2/fixtures/v1-project.json`
- Create: `packages/engine-core/src/v2/fixtures/v2-upgraded.golden.json`
- Modify: `packages/engine-core/src/index.ts`

**Data/schema:** Preserve project, scene, object, component, choice, event, condition, action, variable, prefab, and asset IDs. Create one deterministic default WORLD layer per V1 scene using the permanent UUIDv5 strategy.

**Interfaces:**

```ts
function upgradeEngineProjectV1(project: EngineProjectV1): EngineProjectV2;
```

**API/frontend:** None.

**TDD and verification:**

- [ ] Audit both legacy adapters and their golden identity rules.
- [ ] Write a golden test asserting byte-identical repeated upgrades, preserved IDs, valid V2 output, no title/slug identity, and no mutation of input.
- [ ] Run the exact test; expect RED because the upgrader is absent.
- [ ] Implement the pure mapping and deterministic default-layer IDs.
- [ ] Run all 57+ existing engine-core tests plus V2 tests twice and compare serialized bytes.
- [ ] Commit `feat(engine): upgrade v1 projects to v2`.

**Done when:** A materialized legacy STORY/PLATFORMER V1 project upgrades deterministically and validates directly as V2 without regenerating canonical entity IDs.

### Checkpoint C1: Canonical V2 review

Review V1 immutability, V2 completeness, limits, global stable-ID uniqueness, upgrade golden output, browser safety, and serialization exclusions. Do not add database/API support before approval.

---

### Task 8: Additive ENGINE game discriminator

**Depends on:** Checkpoint C1.

**Scope:** Add only the discriminator needed for new unified projects.

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260909093000_engine_game_source/migration.sql`
- Modify: `packages/database/prisma/schema.test.ts`
- Modify: `packages/contracts/src/games.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Data/schema:** Add `ENGINE` to PostgreSQL/Prisma `GameSourceType`. No default change and no existing-row update.

**API/frontend:** Contracts accept/return `ENGINE`; creation still changes only in Task 9.

**TDD and verification:**

- [ ] Audit the live Prisma enum, every exhaustive `sourceType` branch, migration conventions, and database test harness.
- [ ] Write RED contract/schema/real-PostgreSQL tests proving ENGINE is accepted and all four old enum values/rows remain unchanged.
- [ ] Add the one-value migration and generated-client update.
- [ ] Run database, contracts, API, and web typechecks plus all legacy source-type tests.
- [ ] Commit `feat(database): add engine project source type`.

**Done when:** Existing rows are byte/logically unchanged and `ENGINE` can be persisted without making it the database default.

### Task 9: Atomic unified project creation and routing

**Depends on:** Task 8.

**Scope:** Replace the new-game type form with an atomic blank-project creation command; do not replace existing editors yet.

**Files:**
- Create: `packages/contracts/src/studio-projects.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Modify: `apps/api/src/games/games.controller.ts`
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `apps/api/src/games/games.service.spec.ts`
- Create: `apps/api/test/studio-project-creation.e2e-spec.ts`
- Modify: `apps/web/app/studio/games/new/page.tsx`
- Create: `apps/web/components/create-engine-game.tsx`
- Modify: `apps/web/tests/studio-page.test.tsx`

**Data/schema:** In one database transaction insert `Game(sourceType=ENGINE)`, `EngineProject`, blank V2 revision `0` with `PINNED` retention, and matching head. Generate collision-safe slug server-side from `game-chua-co-ten` plus a suffix; project IDs use UUIDv4.

**Interfaces/API:**

```ts
const CreateEngineGameInput = z.object({ title: z.string().trim().min(1).max(80).default('Game chưa có tên') });
POST /games/engine-projects -> { game: GameSummary; project: EngineProjectReadResponse }
```

Frontend posts once and `router.replace('/studio/games/' + game.id)`; no source-type selector.

**TDD and verification:**

- [ ] Audit current create, slug uniqueness, owner repository, app routing, and rollback behavior.
- [ ] Write RED unit and real-DB tests for atomic success, duplicate/concurrent slug generation, owner linkage, blank V2 validity, and rollback after injected revision failure.
- [ ] Write RED web test proving clicking Create enters the returned Studio route and no type dropdown is rendered.
- [ ] Implement the transaction, contract, minimal one-action page, and redirect.
- [ ] Run legacy create/editor E2E unchanged; verify old routes still choose their old editors.
- [ ] Commit `feat(studio): create unified engine drafts`.

**Done when:** One click creates a recoverable V2 draft and opens its route; no partial Game can remain; legacy creation APIs continue accepting all old inputs.

### Task 10: Typed project mutation batch API

**Depends on:** Task 9.

**Scope:** Add stable-ID-addressed mutation commands and idempotent CAS application; retain Task 5 whole-document PUT for compatibility.

**Files:**
- Create: `packages/engine-core/src/v2/mutations.ts`
- Create: `packages/engine-core/src/v2/mutations.test.ts`
- Modify: `packages/engine-core/src/index.ts`
- Modify: `packages/contracts/src/engine-projects.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Modify: `apps/api/src/engine-projects/engine-projects.controller.ts`
- Modify: `apps/api/src/engine-projects/engine-projects.service.ts`
- Modify: `apps/api/src/engine-projects/engine-projects.repository.ts`
- Modify: `apps/api/src/engine-projects/engine-projects.service.spec.ts`
- Create: `apps/api/test/engine-project-mutations.e2e-spec.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260909100000_engine_project_mutations/migration.sql`
- Modify: `packages/database/prisma/schema.test.ts`

**Data/schema:** Add `EngineProjectMutation(projectId, mutationId, baseRevisionNumber, resultRevisionNumber, createdAt)` with unique `(projectId, mutationId)`. The idempotency row and resulting revision commit in the same transaction. Keep mutations out of canonical JSON.

**Interfaces/API:**

```ts
type ProjectMutation = SceneMutation | LayerMutation | ObjectMutation | ComponentMutation | VariableMutation | EventMutation | ModuleMutation | ScriptMutation;
type ApplyMutationBatchInput = { baseRevision: number; mutationId: string; mutations: ProjectMutation[] };
function applyProjectMutations(project: EngineProjectV2, mutations: ProjectMutation[]): EngineProjectV2;
POST /games/:id/engine-project/mutations -> EngineProjectReadResponse | 409 conflict
```

**TDD and verification:**

- [ ] Audit Task 5 CAS transaction, compaction, and real PostgreSQL locking before adding the idempotency relation.
- [ ] Write RED pure reducer tests for stable-ID addressing, atomic batches, missing targets, ordering, and no input mutation.
- [ ] Write RED real-DB tests for concurrent base revision, replayed mutation ID, ownership race, semantic rejection, reference rollback, and exact authoritative response.
- [ ] Implement the smallest reducer and transactional endpoint; do not expose mutations with no implemented consumer.
- [ ] Run Task 5 whole-document endpoint regression and all engine-core/API gates.
- [ ] Commit code/test/config only; put any plan clarification in a separate documentation commit.

**Done when:** One accepted batch creates exactly one immutable revision; duplicate delivery is harmless; stale writers never overwrite and retain a machine-readable 409.

### Checkpoint C2: Creation and mutation review

Review atomic creation, enum migration, legacy route compatibility, mutation completeness, idempotency, ownership, CAS, reference rows, and retention before a client autosaves.

---

### Task 11: Studio reducer, history, autosave, and recovery store

**Depends on:** Checkpoint C2.

**Scope:** Headless client state only; no full Studio layout or canvas.

**Files:**
- Create: `apps/web/components/studio/studio-state.ts`
- Create: `apps/web/components/studio/studio-reducer.ts`
- Create: `apps/web/components/studio/studio-history.ts`
- Create: `apps/web/components/studio/studio-recovery.ts`
- Create: `apps/web/components/studio/studio-provider.tsx`
- Create: `apps/web/tests/studio-state.test.tsx`
- Modify: `apps/web/package.json` only if the native IndexedDB test environment requires an already-approved dev-only shim.

**Data/schema:** Recovery envelope contains user ID, game ID, acknowledged revision/document, pending typed batch, mutation ID, and timestamp. It is local-only.

**API/frontend:** Debounced autosave invokes Task 10; status is `SAVED | DIRTY | SAVING | UNSYNCED | CONFLICT`.

**TDD and verification:**

- [ ] Audit Next client boundaries, API error handling, fake timers, and browser storage support.
- [ ] Write RED reducer tests for optimistic edit, bounded undo/redo, gesture coalescing, debounce, acknowledged save, offline failure, reload recovery, retry replay, and 409 preserving both local/base documents.
- [ ] Implement reducer/context with injected clock/storage/transport; use no global state dependency.
- [ ] Prove pointer-preview actions do not append history or autosave until committed.
- [ ] Run web unit/typecheck/lint/build and API contract regressions.
- [ ] Commit `feat(studio): add recoverable autosave state`.

**Done when:** Reload cannot discard acknowledged or pending work; undo/redo is deterministic; failed saves remain visibly unsynced.

### Task 12: Desktop Studio shell and real navigation

**Depends on:** Task 11.

**Scope:** Implement the reference-image panel shell with only working navigation/actions; inactive future tools remain absent.

**Files:**
- Modify: `apps/web/app/studio/games/[id]/page.tsx`
- Create: `apps/web/components/studio/studio-shell.tsx`
- Create: `apps/web/components/studio/studio-topbar.tsx`
- Create: `apps/web/components/studio/studio-sidebar.tsx`
- Create: `apps/web/components/studio/studio-panels.tsx`
- Create: `apps/web/components/studio/studio-toast.tsx`
- Create: `apps/web/components/studio/studio-shell.css`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/tests/studio-shell.test.tsx`
- Create: `apps/web/e2e/unified-studio-shell.spec.ts`

**Data/schema:** None.

**API/frontend:** Server page loads owner game plus engine project. ENGINE uses the unified shell; legacy types keep `GameWorkspace`. Title editing uses existing owner metadata PATCH and displays save status.

**TDD and verification:**

- [ ] Audit site layout/header behavior and Next 16 local docs for route/client boundaries.
- [ ] Write RED accessibility/layout tests for back, title, statuses, undo/redo, current Scene, settings, collapsible panels, keyboard tooltips, and absence of dead future controls.
- [ ] Implement full-width dark TFG shell with cyan/blue/purple accents and minimum readable text sizes.
- [ ] Add Playwright coverage at desktop and metadata-only mobile; confirm no browser alerts.
- [ ] Run legacy workspace visual/functional regression.
- [ ] Commit `feat(studio): add unified editor shell`.

**Done when:** ENGINE opens the new desktop IDE shell; legacy games open unchanged; every visible action works.

### Task 13: Scene and layer mutation operations

**Depends on:** Task 11.

**Scope:** Implement Scene Manager and layer operations through Task 10 mutations.

**Files:**
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Modify: `packages/engine-core/src/v2/mutations.test.ts`
- Create: `apps/web/components/studio/scene-manager.tsx`
- Create: `apps/web/components/studio/layer-list.tsx`
- Create: `apps/web/tests/scene-manager.test.tsx`

**Data/schema:** Stable IDs, scene type/settings, order, entry scene, layer order/type/visibility/lock. Duplicate creates fresh IDs for the entire copied subtree.

**API/frontend:** Uses mutation batch endpoint only; no Scene/Layer database CRUD table.

**TDD and verification:**

- [ ] Audit V2 reference semantics before defining delete policy.
- [ ] Write RED tests for create, rename, duplicate, reorder, confirmed delete, entry-scene reassignment, dangling-reference rejection, and undo/redo.
- [ ] Implement pure mutations and accessible Scene/Layer controls; deletion uses TFG confirmation UI.
- [ ] Verify autosave/reload preserves exact order/settings and legacy upgraded scenes remain valid.
- [ ] Commit `feat(studio): manage scenes and layers`.

**Done when:** All Scene Manager and layer operations persist as canonical revisions and can be undone without index-based identity.

### Task 14: Object and component mutation operations

**Depends on:** Task 13.

**Scope:** Implement unified object hierarchy data operations and component configuration primitives.

**Files:**
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Modify: `packages/engine-core/src/v2/mutations.test.ts`
- Modify: `packages/engine-core/src/v2/component-registry.ts`
- Create: `apps/web/components/studio/object-commands.ts`
- Create: `apps/web/tests/object-commands.test.ts`

**Data/schema:** Object create/duplicate/delete/reparent/rename/reorder/visibility/active/lock/layer plus component add/remove/update. Transform includes finite x/y, size, rotation, and scale; render order is explicit.

**API/frontend:** Typed mutations only.

**TDD and verification:**

- [ ] Audit all registry definitions and contextual validators; list required new components before changing the registry.
- [ ] Write RED tests for Player/NPC/Item/Trigger/UI/Decoration/Custom objects assembled from shared components, subtree IDs, parent cycles, incompatible components, and atomic undo.
- [ ] Add only components required by exposed operations, each with schema/defaults/migration metadata/runtime key.
- [ ] Implement commands and run all V1 registry/event regressions.
- [ ] Commit `feat(studio): edit game objects and components`.

**Done when:** Object roles are compositions rather than database/game-type branches and every mutation produces valid V2.

### Checkpoint C3: Editor state and domain operations review

Review recovery, conflict UX, bounded history, responsive shell, scene deletion semantics, fresh duplicate IDs, component extensibility, and absence of dual-write tables.

---

### Task 15: Pure Canvas2D scene renderer and hit testing

**Depends on:** Task 14.

**Scope:** Render canonical scene data to Canvas2D; no editing gestures yet.

**Files:**
- Create: `packages/engine-core/src/runtime/render-model.ts`
- Create: `packages/engine-core/src/runtime/render-model.test.ts`
- Create: `apps/web/components/studio/canvas/coordinates.ts`
- Create: `apps/web/components/studio/canvas/scene-renderer.ts`
- Create: `apps/web/components/studio/canvas/hit-test.ts`
- Create: `apps/web/tests/scene-canvas-renderer.test.ts`

**Interfaces:**

```ts
type Camera2D = { x: number; y: number; zoom: number; viewportWidth: number; viewportHeight: number };
function buildRenderList(scene: SceneV2): RenderItem[];
function renderScene(context: CanvasRenderingContext2D, list: RenderItem[], camera: Camera2D): void;
function hitTest(list: RenderItem[], worldPoint: Point): StableId | null;
```

**Data/API:** Read-only canonical input; no DB/API changes.

**TDD and verification:**

- [ ] Audit available browser APIs and test Canvas mocking; do not add an engine dependency.
- [ ] Write RED tests for layer/order/visibility/lock, transform matrices, image placeholders, selection bounds, world/screen conversion, and topmost hit.
- [ ] Implement deterministic render-list and Canvas2D drawing separated from React.
- [ ] Profile a generated 1,000-object scene and record frame/build-list timing in the task report.
- [ ] Commit `feat(studio): render canonical scenes on canvas`.

**Done when:** The center is a real canvas driven solely by canonical scene data and selections resolve to stable object IDs.

### Task 16: Canvas interaction, grid, gestures, and history

**Depends on:** Task 15.

**Scope:** Selection, pan, zoom/reset, grid/snap, move, suitable resize, keyboard delete, and commit-on-drop.

**Files:**
- Create: `apps/web/components/studio/canvas/scene-canvas.tsx`
- Create: `apps/web/components/studio/canvas/gesture-controller.ts`
- Create: `apps/web/components/studio/canvas/selection-overlay.ts`
- Create: `apps/web/tests/scene-canvas.test.tsx`
- Create: `apps/web/e2e/studio-canvas.spec.ts`

**Data/API:** One committed gesture becomes one typed mutation/history entry/autosave batch.

**TDD and verification:**

- [ ] Write RED pointer/keyboard tests for select, drag preview, drop, snap, resize eligibility, pan-space/tool, zoom bounds/reset, locked/hidden objects, delete confirmation policy, Ctrl+Z and redo variants.
- [ ] Implement transient gesture state outside the canonical reducer.
- [ ] Assert drag pointer moves cause zero network requests and one drop causes one debounced save.
- [ ] Run browser tests using real pointer events and reload the resulting revision.
- [ ] Commit `feat(studio): edit scenes with canvas gestures`.

**Done when:** Direct manipulation is primary, precise fields remain advanced, and dragging does not rerender/save the whole Studio per pixel.

### Task 17: Hierarchy, inspector, and asset-drop boundary

**Depends on:** Task 16.

**Scope:** Synchronize canvas selection with hierarchy and schema-driven inspector; accept asset drag payloads but use fixture metadata until Task 19 wires the real library.

**Files:**
- Create: `apps/web/components/studio/hierarchy-panel.tsx`
- Create: `apps/web/components/studio/property-inspector.tsx`
- Create: `apps/web/components/studio/component-editor.tsx`
- Create: `apps/web/components/studio/asset-drop.ts`
- Create: `apps/web/tests/hierarchy-inspector.test.tsx`

**Data/API:** Inspector edits typed component properties. Drop command requires a stable READY asset ID and creates role-appropriate object/components at world coordinates.

**TDD and verification:**

- [ ] Write RED tests for bidirectional selection/focus, group/tree expansion, layer reordering, visibility/lock, schema-specific fields, validation errors, and Image/Sprite/Item/UI drops.
- [ ] Implement focused panels without duplicating component schemas in frontend business logic.
- [ ] Verify no manual X/Y form is required for normal placement and all edits undo/autosave.
- [ ] Commit `feat(studio): add hierarchy and property inspector`.

**Done when:** Canvas, hierarchy, inspector, and canonical selection target remain synchronized and asset drop creates real data.

### Checkpoint C4: Canvas/editor interaction review

Review real Canvas2D use, canonical-data linkage, coordinate correctness, performance evidence, gesture batching, keyboard accessibility, hierarchy synchronization, inspector validation, and absence of mock controls.

---

### Task 18: Immutable asset storage lifecycle API

**Depends on:** Checkpoint C4; supersedes old Phase 1 Task 6.

**Scope:** Implement secure owner-only upload/list/read/rename/tombstone/GC using existing Task 4 tables.

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
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260909110000_game_asset_metadata/migration.sql`
- Modify: `packages/database/prisma/schema.test.ts`

**Data/schema:** Existing `GameAsset`, `EngineRevisionAsset`, and `GameBuildAsset`, plus additive `GameAsset.metadata Json @default("{}")`. Validated metadata stores category and media-specific import settings; thumbnail bytes use a deterministic immutable derivative key and are never copied into object JSON.

**API:** Owner-only multipart upload, paginated list/search/filter, content/thumbnail read, rename/category update, tombstone, and internal guarded GC claim.

**Frontend:** None beyond contracts.

**TDD and verification:**

- [ ] Audit cover/artifact storage, upload limits, MIME handling, symlink/path defenses, and proxy buffering.
- [ ] RED-test auth before buffering, extension/MIME/magic mismatch, actual streamed size, dimensions, atomic install, retry reconciliation, cross-project access, tombstone blocking new references, and revision/build refs blocking GC.
- [ ] Implement state transitions and physical storage with no immediate delete semantics.
- [ ] Run real-PostgreSQL composite-hash tests, security tests, API regression, typecheck/build/lint.
- [ ] Commit `feat(api): manage immutable game assets`.

**Done when:** No referenced byte can be removed or replaced and uncertain upload retry converges safely.

### Task 19: Asset Manager and real drag source

**Depends on:** Task 18.

**Scope:** Wire Studio library groups, upload, progress, search/filter, lazy preview, rename, and dependency-aware tombstone.

**Files:**
- Create: `apps/web/components/studio/assets/asset-manager.tsx`
- Create: `apps/web/components/studio/assets/asset-grid.tsx`
- Create: `apps/web/components/studio/assets/asset-uploader.tsx`
- Create: `apps/web/components/studio/assets/asset-preview.tsx`
- Create: `apps/web/tests/asset-manager.test.tsx`
- Create: `apps/web/e2e/studio-assets.spec.ts`

**Data/API:** Uses Task 18; drag payload contains asset ID/kind only. Canonical object stores asset ID only.

**TDD and verification:**

- [ ] RED-test groups All/Map-Tileset/Character/NPC/Item/UI/Audio/Effect/Image/User, search/filter, previews, progress, retry, dependency warning, and drop into canvas/UI layer.
- [ ] Implement API-backed views with lazy image loading and no hardcoded storage URL.
- [ ] Verify reload resolves the saved asset reference and tombstoned/referenced assets behave correctly.
- [ ] Commit `feat(studio): add asset manager`.

**Done when:** Users can upload and drag real assets into scenes without copying metadata into objects.

### Task 19A: Map, character, collision, and camera tools

**Depends on:** Task 19.

**Scope:** Add real map/background/tile editing, character sprite configuration, collision painting, spawn points, and camera settings on top of canonical scenes and assets.

**Files:**
- Create: `apps/web/components/studio/map/map-tools.tsx`
- Create: `apps/web/components/studio/map/tile-painter.tsx`
- Create: `apps/web/components/studio/map/collision-painter.tsx`
- Create: `apps/web/components/studio/characters/character-editor.tsx`
- Create: `apps/web/components/studio/camera-editor.tsx`
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Create: `apps/web/tests/map-tools.test.tsx`
- Create: `apps/web/e2e/studio-map.spec.ts`

**Data/schema:** Scene background or tile map, tile size/grid dimensions, ground/decoration/collision layers, sparse bounded tile data, spawn components, sprite frame dimensions/states, and camera bounds/follow/focus targets.

**API/frontend:** Task 10 mutation batches and Task 18 asset reads; no tile/object database tables.

**TDD and verification:**

- [ ] RED-test tileset selection, pencil, eraser, bounded fill, collision paint, large-background alternative, NPC/player/item/trigger placement, static-image character, sprite-sheet frames/animation states, camera follow/bounds/focus, undo coalescing, autosave, and reload.
- [ ] Implement pointer tools that batch one stroke into one canonical mutation and history entry.
- [ ] Profile a maximum bounded tile layer and prove tools do not send a request per tile/pointer event.
- [ ] Commit `feat(studio): add map and character tools`.

**Done when:** Users can build and restore a playable map without manually entering tile/collision arrays or coordinates.

### Task 19B: UI layer and audio authoring tools

**Depends on:** Task 19A.

**Scope:** Add direct UI placement/preview and AudioSource configuration using real canonical components and assets.

**Files:**
- Create: `apps/web/components/studio/ui/ui-tools.tsx`
- Create: `apps/web/components/studio/ui/ui-preview.tsx`
- Create: `apps/web/components/studio/audio/audio-editor.tsx`
- Modify: `apps/web/components/studio/property-inspector.tsx`
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Create: `apps/web/tests/ui-audio-tools.test.tsx`

**Data/schema:** UI Text/Image/Button/Panel components with anchor, size, visibility, optional variable binding, and action reference; audio component with asset, volume, loop, autoplay, trigger, and bounded fade.

**API/frontend:** Asset reads and canonical mutations only.

**TDD and verification:**

- [ ] RED-test drag Text/Image/Button/Panel into a UI layer, anchor/resize/render order, score variable binding, button action, audio preview/config, missing/tombstoned asset diagnostics, undo/autosave/reload.
- [ ] Implement real canvas/UI-layer rendering and inspector forms; expose only supported controls.
- [ ] Commit `feat(studio): author ui and audio layers`.

**Done when:** UI and audio configurations persist in the same scene/project model and preview without a parallel form-only system.

### Checkpoint C5: Asset review

Review upload security, immutable paths/hashes, recovery, dependency deletion, lazy loading, ownership, canvas drops, tile/collision batching, character frames, UI bindings, audio references, and GC proofs before runtime consumes assets.

---

### Task 20: Variables and dialogue/story authoring

**Depends on:** Task 19B and Checkpoint C5.

**Scope:** Implement Variable Manager and Dialogue/Choice authoring over V2.

**Files:**
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Modify: `packages/engine-core/src/validation.ts`
- Create: `apps/web/components/studio/variables/variable-manager.tsx`
- Create: `apps/web/components/studio/story/dialogue-editor.tsx`
- Create: `apps/web/tests/studio-story.test.tsx`

**Data/schema:** Boolean/number/string variables initially; arrays stay rejected until runtime semantics are approved. Dialogue supports speaker, avatar asset, ordered lines, stable choices, display conditions, and action references.

**API:** Mutation batches only.

**TDD and verification:**

- [ ] RED-test scopes/types, rename without ID change, duplicate names policy, choice branching, variable/scene/action references, invalid deletion, undo/autosave/reload.
- [ ] Implement schema-driven panels and pure mutations.
- [ ] Upgrade a legacy STORY fixture and edit it without changing inherited IDs.
- [ ] Commit `feat(studio): author variables and dialogue`.

**Done when:** Story is an attachable module/component in mixed scenes, not an editor/game-type branch.

### Task 21: Event mutation operations and semantic diagnostics

**Depends on:** Task 20.

**Scope:** Add authoring mutations and project-context diagnostics for the already-closed Task 6B event language; do not alter its serialized vocabulary.

**Files:**
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Modify: `packages/engine-core/src/v2/mutations.test.ts`
- Modify: `packages/engine-core/src/v2/event-validation.ts`
- Create: `packages/engine-core/src/v2/event-authoring.test.ts`

**Data/schema:** No schema expansion. Mutations create, replace, remove, and reorder Task 6B event nodes by stable ID; diagnostics resolve their scene/object/component/asset/variable/module/script references.

**API/frontend:** None.

**TDD and verification:**

- [ ] Audit Task 6B nodes and Task 10 mutation atomicity before defining authoring commands.
- [ ] RED-test event/node CRUD, reorder, stable IDs, invalid deletion, contextual references, undo inverses, and preservation of Task 6B budgets/code rejection.
- [ ] Implement minimal event mutations and contextual diagnostic paths without adding node types.
- [ ] Run all Task 2 and Task 6B tests unchanged and prove V1 events still parse identically.
- [ ] Commit `feat(engine): add v2 event authoring operations`.

**Done when:** Every closed V2 event node can be safely authored through typed mutations and reports actionable canonical paths.

### Task 22: Visual Event Editor

**Depends on:** Task 21.

**Scope:** Author canonical event trees/ordered blocks without React Flow.

**Files:**
- Create: `apps/web/components/studio/events/event-editor.tsx`
- Create: `apps/web/components/studio/events/event-list.tsx`
- Create: `apps/web/components/studio/events/node-palette.tsx`
- Create: `apps/web/components/studio/events/event-node.tsx`
- Create: `apps/web/tests/event-editor.test.tsx`
- Create: `apps/web/e2e/studio-events.spec.ts`

**Data/API:** Task 10 mutations; node stable IDs; UI layout state stays local.

**TDD and verification:**

- [ ] RED-test create/reorder/connect-as-tree, trigger-condition-action editing, references, sequence/branch/delay/repeat, invalid-node diagnostics, keyboard access, undo/autosave/reload.
- [ ] Implement block list/tree with native pointer/keyboard interactions; do not add a graph dependency.
- [ ] Prove an NPC quest flow serializes directly to `EngineProjectV2` with no generated JavaScript/vendor state.
- [ ] Commit `feat(studio): add visual event editor`.

**Done when:** A non-programmer can build the approved Trigger→Condition→Action flow and the canonical document remains vendor-free.

### Task 23: Mini-game module contracts and orchestration

**Depends on:** Task 21.

**Scope:** Define runtime plugin interfaces and deterministic orchestration for the already-closed Task 6C Quiz/Puzzle data; no game UI implementation.

**Files:**
- Create: `packages/engine-core/src/v2/mini-games.ts`
- Create: `packages/engine-core/src/v2/mini-games.test.ts`
- Modify: `packages/engine-core/src/v2/event-validation.ts`
- Modify: `packages/engine-core/src/index.ts`

**Interfaces:**

```ts
type MiniGameResult = { outcome: 'SUCCESS' | 'FAILED'; score: number; rewards: readonly Reward[] };
type MiniGameDefinition = { id: StableId; type: 'QUIZ' | 'PUZZLE' | 'MEMORY' | 'DRAG_DROP' | 'REACTION'; version: 1; config: unknown };
type MiniGamePlugin = { type: string; schema: ZodType; createInitialState(config: unknown): unknown; reduce(state: unknown, input: unknown): unknown; result(state: unknown): MiniGameResult | null };
```

**TDD and verification:**

- [ ] RED-test registry uniqueness, deterministic state, input/result bounds, event target/result references, inactive plugin denial, and unknown-type rejection.
- [ ] Implement only the orchestration boundary for the existing Quiz/Puzzle schemas.
- [ ] Commit `feat(engine): define mini-game modules`.

**Done when:** Later mini-games can be added through one registry without changing object/database architecture.

### Task 24: Quiz and Puzzle editor/runtime modules

**Depends on:** Task 23.

**Scope:** Implement the first two real mini-game plugins and Studio editors.

**Files:**
- Create: `packages/engine-core/src/runtime/mini-games/quiz.ts`
- Create: `packages/engine-core/src/runtime/mini-games/puzzle.ts`
- Create: `packages/engine-core/src/runtime/mini-games/mini-games.test.ts`
- Create: `apps/web/components/studio/mini-games/mini-game-manager.tsx`
- Create: `apps/web/components/studio/mini-games/puzzle-editor.tsx`
- Create: `apps/web/tests/mini-game-editor.test.tsx`

**Data/API:** Canonical module mutations only.

**TDD and verification:**

- [ ] RED-test authoring, deterministic play state, success/failure/score/reward, return scene/context, result event, undo/autosave/reload.
- [ ] Implement complete Quiz and bounded tile/sequence Puzzle modules; do not expose other types.
- [ ] Commit `feat(studio): add quiz and puzzle modules`.

**Done when:** An event can start either implemented module and consume a real typed result.

### Task 24A: Memory, Drag-and-Drop, and Reaction modules

**Depends on:** Task 24.

**Scope:** Complete the remaining approved initial mini-game set with real editors and deterministic runtime plugins.

**Files:**
- Create: `packages/engine-core/src/runtime/mini-games/memory.ts`
- Create: `packages/engine-core/src/runtime/mini-games/drag-drop.ts`
- Create: `packages/engine-core/src/runtime/mini-games/reaction.ts`
- Modify: `packages/engine-core/src/runtime/mini-games/mini-games.test.ts`
- Create: `apps/web/components/studio/mini-games/memory-editor.tsx`
- Create: `apps/web/components/studio/mini-games/drag-drop-editor.tsx`
- Create: `apps/web/components/studio/mini-games/reaction-editor.tsx`
- Modify: `apps/web/tests/mini-game-editor.test.tsx`

**Data/API:** Uses the closed Task 6C definitions and canonical module mutations; no database tables per mini-game type.

**TDD and verification:**

- [ ] RED-test bounded card matching, stable drag targets, reaction timing with injected clock, accessible input, deterministic success/failure/score/reward, event result consumption, undo/autosave/reload.
- [ ] Implement each plugin and editor; expose its palette option only after its focused tests pass.
- [ ] Run all Quiz/Puzzle and V2 project regressions.
- [ ] Commit `feat(studio): add initial mini-game set`.

**Done when:** Quiz, Puzzle, Memory, Drag-and-Drop, and Reaction all have working authoring and runtime behavior with the same result contract.

### Checkpoint C6: Narrative, events, and mini-game review

Review schema breadth, reference safety, runtime budgets, no arbitrary executable fields, visual editor usability, dialogue branching, and all five real initial mini-game implementations before scripts are introduced.

---

### Task 25: Script resources, attachments, and code editor

**Depends on:** Checkpoint C6.

**Scope:** Implement script authoring data and editor; no execution yet.

**Files:**
- Modify: `packages/engine-core/src/v2/mutations.ts`
- Create: `packages/engine-core/src/v2/script-authoring.test.ts`
- Create: `apps/web/components/studio/code/script-manager.tsx`
- Create: `apps/web/components/studio/code/code-editor.tsx`
- Create: `apps/web/tests/code-editor.test.tsx`

**Data/schema:** Use the closed Task 6C stable script ID, name, JavaScript language, bounded source, declared capabilities, and Scene/Object/Event attachment references. TypeScript remains absent until a compilation/sourcemap design is reviewed.

**API/frontend:** Mutation batches persist source. Start with an accessible textarea plus syntax tokens only if an existing lightweight capability suffices; Monaco requires a separate bundle/performance approval.

**TDD and verification:**

- [ ] RED-test multi-script CRUD, attachments, rename/reorder, size limit, forbidden executable object/function fields, debounce, undo/recovery, and no source in metadata/public DTOs.
- [ ] Implement script manager/editor with explicit advanced-mode placement.
- [ ] Search API production code and test that no `eval`, `Function`, VM execution, or dynamic import consumes creator source.
- [ ] Commit `feat(studio): author sandboxed script resources`.

**Done when:** Advanced users can safely author referenced scripts, while beginner workflows never require code.

### Task 26: Sandboxed runtime bridge

**Depends on:** Task 25.

**Scope:** Execute scripts only in the game iframe with a capability-limited bridge.

**Files:**
- Create: `packages/engine-core/src/runtime/script-api.ts`
- Create: `packages/engine-core/src/runtime/script-api.test.ts`
- Create: `apps/web/components/runtime/script-host.ts`
- Create: `apps/web/e2e/runtime-script-sandbox.spec.ts`
- Modify only after evidence: `apps/api/src/games/game-content.controller.ts`

**Interfaces:** `game.getVariable`, `setVariable`, `changeScene`, `spawnObject`, `playAudio`, and `showDialogue`; each validates IDs/types and declared capability.

**TDD and verification:**

- [ ] Audit current iframe headers/CSP/capability token path before code; characterize behavior without widening policy.
- [ ] RED-test null-origin isolation, no cookies/DOM/server fetch, nonce/source/schema/size/rate validation, undeclared method denial, infinite-loop termination strategy, and expiry behavior with controllable clocks.
- [ ] Implement the narrow message bridge and browser-only executor; retain sandbox without `allow-same-origin`.
- [ ] If CSP or interruption cannot satisfy tests, stop at this task and submit a separate security design rather than weaken isolation.
- [ ] Commit `feat(runtime): add sandboxed script bridge` only when all security tests pass.

**Done when:** Creator code can affect only the declared game-state API inside preview/build runtime and cannot access backend authority.

### Checkpoint C7: Script security review

Review browser-only execution proof, iframe/CSP, capability validation, denial paths, resource budgets, API source scan, and bundle impact. Do not integrate scripts into the unified runtime before approval.

---

### Task 27: Unified Canvas2D runtime and event interpreter

**Depends on:** Checkpoint C7, Tasks 15, 21, 23, 24, and 26.

**Scope:** Run V2 scenes, components, events, modules, and asset resolution; this is the first runtime interpreter task.

**Files:**
- Create: `packages/engine-core/src/runtime/runtime-state.ts`
- Create: `packages/engine-core/src/runtime/event-interpreter.ts`
- Create: `packages/engine-core/src/runtime/runtime.ts`
- Create: `packages/engine-core/src/runtime/runtime.test.ts`
- Create: `apps/web/components/runtime/canvas-runtime.tsx`
- Create: `apps/web/tests/canvas-runtime.test.tsx`

**Data/API:** Consumes validated immutable V2 snapshot plus resolved asset manifest. It never mutates canonical input.

**TDD and verification:**

- [ ] RED-test scene load/change, render order, movement/collision/interaction, dialogue, variables, inventory, trigger areas, audio commands, UI binding, mini-game return, script action, sequence/branch/delay/repeat, and hard execution budgets.
- [ ] Implement a deterministic clock/input-injected runtime and handler registry keyed by component/event metadata.
- [ ] Prove one mixed scene contains Map + Player + NPC + Trigger + Dialogue without game-type branches.
- [ ] Run browser performance characterization and all parser cycle regressions.
- [ ] Commit `feat(runtime): run unified engine projects`.

**Done when:** V2 behavior is data-driven and no per-game source change is required.

### Task 28: Revision-pinned preview, debug panel, and validation UX

**Depends on:** Task 27.

**Scope:** Add real playtest/restart/scene selection/debug and publish-blocking validation.

**Files:**
- Create: `packages/contracts/src/game-preview.ts`
- Create: `apps/api/src/engine-preview/engine-preview.controller.ts`
- Create: `apps/api/src/engine-preview/engine-preview.service.ts`
- Create: `apps/api/src/engine-preview/engine-preview.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/components/studio/preview/playtest-panel.tsx`
- Create: `apps/web/components/studio/preview/debug-panel.tsx`
- Create: `apps/web/components/studio/validation-panel.tsx`
- Create: `apps/web/e2e/unified-preview.spec.ts`

**API:** Owner-only capability for an exact saved revision; no preview of a mutable DB head without revision identity.

**Validation:** Missing entry/spawn, missing/non-ready asset, dangling event/object/script/module reference, script syntax parse failure, and duplicate slug classification as warning/error.

**TDD and verification:**

- [ ] RED-test ownership, revision pin, unsaved prompt/save path, restart, direct-scene play, current scene, variables, event log, runtime errors, optional FPS, and serious-error blocking signal.
- [ ] Implement preview manifest/capability and real runtime panel.
- [ ] Save a newer draft and prove an older preview capability remains revision-stable.
- [ ] Commit `feat(studio): preview and validate engine revisions`.

**Done when:** Chạy thử uses the real runtime and exact project data; validation presents actionable warnings/errors with no fake result.

### Checkpoint C8: Runtime and preview review

Review editor/runtime shared model, deterministic execution, cycle budgets, asset resolution, script isolation, preview authorization/revision pinning, debug usefulness, and performance evidence.

---

### Task 29: Immutable engine build lifecycle

**Depends on:** Checkpoint C8; supersedes old Phase 1 Task 7.

**Scope:** Build exact V2 revisions/assets into immutable unified runtime artifacts without changing public play.

**Files:**
- Create: `packages/contracts/src/game-builds.ts`
- Create: `apps/api/src/game-builds/game-builds.controller.ts`
- Create: `apps/api/src/game-builds/game-builds.service.ts`
- Create: `apps/api/src/game-builds/game-builds.repository.ts`
- Create: `apps/api/src/game-builds/game-builds.module.ts`
- Create: `apps/api/src/game-builds/game-builds.service.spec.ts`
- Create: `apps/api/test/game-builds.e2e-spec.ts`
- Modify: `apps/api/src/game-artifacts/artifact-storage.ts`
- Modify: `apps/api/src/app.module.ts`

**Data/API:** Existing GameBuild/GameBuildAsset states and exact hashes. Owner create/status/cancel routes.

**TDD and verification:**

- [ ] RED-test owner-only creation, exact revision/assets, non-ready/tombstoned/foreign/hash mismatch, legal transitions, parallel IDs, lost response reconciliation, runtime manifest, and public pointer unchanged.
- [ ] Implement transactional pin, out-of-transaction artifact install, and conditional finalization.
- [ ] Prove creator scripts are packaged but never executed by builder/API.
- [ ] Run legacy artifact/compiler regression.
- [ ] Commit `feat(api): build immutable engine releases`.

**Done when:** Every READY build is reproducible from one revision and exact asset hashes while public state remains untouched.

### Task 30: Release, moderation, publication, and rollback

**Depends on:** Task 29; supersedes old Phase 1 Task 8.

**Scope:** Publish reviewed engine builds and preserve legacy public resolution.

**Files:**
- Create: `packages/contracts/src/game-releases.ts`
- Create: `apps/api/src/game-releases/game-releases.controller.ts`
- Create: `apps/api/src/game-releases/game-releases.service.ts`
- Create: `apps/api/src/game-releases/game-releases.repository.ts`
- Create: `apps/api/src/game-releases/game-releases.module.ts`
- Create: `apps/api/src/game-releases/game-releases.service.spec.ts`
- Modify: `apps/api/src/games/public-games.service.ts`
- Modify: `apps/api/src/games/game-content.service.ts`
- Modify: `apps/api/src/games/moderation.service.ts`
- Create: `apps/api/test/game-releases.e2e-spec.ts`
- Create: `apps/web/components/studio/publish-panel.tsx`
- Create: `apps/web/e2e/studio-publish.spec.ts`

**Data/API:** Owner submits READY build; moderator/admin approves/rejects; admin reasoned rollback creates history. Current pointer changes atomically.

**TDD and verification:**

- [ ] RED-test authorization matrix, validation gate, foreign/stale/non-ready build, concurrent approval, supersede, reject, rollback, quarantine/access, and cross-game pointer.
- [ ] Implement state transactions with no filesystem work inside publication.
- [ ] Resolve ENGINE public bytes only from current release/build; retain exact legacy branch for games without engine releases.
- [ ] Play public release, save/build a newer draft, and prove public bytes/hash stay unchanged.
- [ ] Commit `feat(api): publish immutable engine builds`.

**Done when:** Exactly one current PUBLISHED engine release exists, history is immutable, and draft work cannot alter public play.

### Checkpoint C9: Build and publication review

Review provenance, transition legality, moderation races, current-pointer constraints, rollback audit, legacy public lookup, iframe headers, and proof that draft/build cannot unpublish or mutate public content.

---

### Task 31: Mixed-game fixture, end-to-end journey, and final regression

**Depends on:** Checkpoint C9.

**Scope:** Prove the complete product journey and compatibility; integration fixes only.

**Files:**
- Create: `packages/engine-core/src/v2/fixtures/mixed-game-v2.json`
- Create: `apps/api/test/unified-studio-lifecycle.e2e-spec.ts`
- Create: `apps/web/e2e/unified-studio-lifecycle.spec.ts`
- Create: `scripts/test-unified-studio-migration.mjs`
- Modify: `docs/development.md`
- Modify: `docs/api/foundation.md`
- Modify relevant tests only when additive response compatibility requires it.

**Fixture:** At least two scenes, map, player, two NPCs, dialogue, trigger, item, variable, and Quiz or Puzzle. Flow: Map → NPC dialogue/quest → item → mini-game → success → second scene/ending.

**TDD and verification:**

- [ ] First write the failing API/browser journey: create blank game, add scenes/map/assets/player/NPC/dialogue/event/item/variable/module, autosave, reload, recover unsynced edit, preview, validate, build, submit, approve, public play, edit draft, and confirm public stability.
- [ ] Add authorization tests for every new route and a second owner.
- [ ] Add browser reload, conflict, undo/redo, large-scene drag performance, missing asset, invalid event, script sandbox, and no-dead-button assertions.
- [ ] Rehearse additive migrations against a copied pre-engine database and compare legacy row/artifact checksums.
- [ ] Run contracts, engine-core, database, API unit/E2E, web unit/E2E, typecheck, lint, production builds, container/deployment contracts, migration, and restore checks from a clean checkout.
- [ ] Run all four legacy create/edit/preview/moderate/public-play journeys without changing their stored source or artifacts.
- [ ] Request independent code and security review; resolve all Critical/Important findings through focused RED→GREEN cycles.
- [ ] Commit `test(studio): prove unified mixed-game lifecycle`.

**Done when:** Every required route and visible control works against real data; reload/restore is exact; mixed gameplay runs in one project; public release isolation and all legacy lanes are proven.

### Checkpoint C10: Unified Game Studio completion review

Review the complete diff, exact test counts, sample project journey, migration/restore evidence, authorization matrix, performance measurements, script/upload security, backward compatibility, remaining risks, and production rollout plan. Completion approval does not authorize rollout.

## Execution rule

Implementation begins only after the plan structure and Checkpoint C1 scope are approved. Execute exactly one task at a time in dependency order. Stop at every checkpoint; do not pre-build later UI, API, runtime, asset, build, or release controls.
