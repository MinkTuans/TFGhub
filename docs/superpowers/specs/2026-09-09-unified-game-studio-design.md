# Unified Game Studio Design

## Status and scope

This design replaces the post-Task-5 portion of the Phase 1 plan. Tasks 1–5
remain accepted foundations and are not rewritten. The new work builds one
desktop-first, data-driven Studio in which a project may combine scenes, maps,
story, NPCs, UI, events, mini-games, and sandboxed scripts.

The work is delivered sequentially with review checkpoints. No task may expose
a dead control, placeholder endpoint, fake canvas, or production-only demo
data. Existing `UPLOAD`, `CODE`, `STORY`, and `PLATFORMER` games, artifacts,
editors, public routes, and moderation behavior remain operational throughout
the compatibility window.

## Sources of truth

- `Game` remains the catalog identity and owns title, slug, description,
  thumbnail/cover, access, moderation, ownership, and legacy compatibility
  fields.
- `EngineProjectRevision.document` is the only authoring source of truth for a
  unified Studio project.
- `EngineProject.headRevisionNumber` identifies the current draft snapshot.
- `GameBuild` pins an immutable project revision and exact asset hashes.
- `Game.currentPublishedReleaseId` resolves the immutable public release.
- Scene, layer, object, component, variable, event, mini-game, and script data
  are not independently writable relational records. A future projection may
  index them for reads, but it must be disposable and derived from revisions.

## Compatibility strategy

`GameSourceType` gains the additive value `ENGINE`. New unified projects use
that value. Existing values keep their exact behavior:

- `STORY` and `PLATFORMER` may be deterministically materialized through the
  existing adapters and then upgraded from V1 to V2.
- `CODE` and `UPLOAD` remain in their current editor/build/play lanes and are
  never silently converted.
- existing public games continue resolving legacy artifacts until an explicit
  reviewed engine release exists;
- existing routes remain available while new engine routes are additive.

`EngineProjectV1` remains immutable as a public schema. `EngineProjectV2` is a
new reader/writer contract. A pure V1-to-V2 adapter preserves every stable ID,
component, event, variable, prefab, asset reference, viewport, and ordering,
while creating deterministic default layers and settings. Future schema
versions remain raw and read-only.

## Canonical V2 document

V2 is split into focused schema modules but released as one closed canonical
contract. It contains:

- project identity, entry scene, viewport, grid, camera, and editor-independent
  settings;
- ordered scenes with `MIXED`, `MAP`, `STORY`, `MINI_GAME`, or `MENU` intent;
- ordered `WORLD`, `UI`, and `COLLISION` layers with visibility and lock state;
- hierarchical game objects with stable layer/parent references, enabled,
  visible, locked, render order, object role, and component instances;
- the extensible component registry, including transform, rendering,
  collision, movement, dialogue, interaction, inventory, trigger, audio,
  health, quest, UI, camera, mini-game, and script-reference behavior;
- typed global/player/scene variables;
- bounded visual events with trigger, condition, and ordered control/action
  nodes;
- mini-game definitions with typed input and result contracts;
- script resources identified by stable ID, language, source, attachment
  target, and declared capabilities;
- asset IDs only—never storage URLs, paths, data URLs, or binary payloads.

Editor-only state such as selected object, panel sizes, zoom, pan, open tab,
React state, vendor graph positions, and undo history is excluded from the
canonical document. User-relevant viewport preferences may be stored locally.

## Mutation and autosave protocol

The browser owns an optimistic `StudioState` containing the last acknowledged
revision, current canonical document, a bounded undo/redo history, pending
typed mutations, and save status. All edits are expressed as typed mutations,
for example `SCENE_CREATE`, `OBJECT_MOVE`, `COMPONENT_UPDATE`, and
`EVENT_REPLACE`. Mutations address stable IDs, never array indexes.

Autosave debounces a batch and sends `{ baseRevision, mutationId, mutations }`.
The API locks ownership and the project head, applies the batch through the
same pure reducer used by tests, validates the resulting V2 document, inserts
one immutable revision plus asset references, and advances the head in one
transaction. A repeated `mutationId` returns its prior result. A stale base
returns `409 PROJECT_REVISION_CONFLICT`; the client retains local work and
offers explicit reload/reapply rather than silently overwriting either side.

An IndexedDB-backed recovery envelope stores the acknowledged revision,
canonical base document, and pending mutation batch. Reload restores pending
work before resuming autosave. Recovery data is keyed by user and project and
is removed only after the server acknowledges the same mutation ID.

## Editor architecture

The Studio route uses a dedicated full-width shell rather than the site form
layout. Its top bar contains navigation, editable title, draft/published and
save states, undo/redo, validation, playtest, publish, and settings. Collapsible
panels provide tools/assets, hierarchy/scenes, the central canvas, inspector,
visual logic, code, and playtest/debug views.

The Editor Layer consists of:

- a pure project mutation reducer and command creators;
- a project store built with React reducer/context initially;
- bounded history using inverse mutations or snapshots selected by profiling;
- panel components scoped by responsibility;
- keyboard commands with editable-field guards;
- accessible labels/tooltips and non-blocking TFG toast notifications.

No external state library is added until profiling proves React reducer/context
insufficient. No whole-Studio rerender may occur for every pointer move; drag
preview remains transient and commits one canonical move mutation on drop.

## Canvas and hierarchy

The scene editor uses a real `<canvas>` with a renderer that consumes the same
canonical scene model as the runtime abstraction. Pointer hit testing uses
world coordinates and stable object IDs. Pan, zoom, reset, grid, snap,
selection, move, suitable resize, visibility, lock, layer ordering, and
selection synchronization are functional before their controls are exposed.

Asset drag-and-drop contains only a stable asset ID and intended object role.
Dropping creates a real object/component subtree at the world position.
Hierarchy selection focuses/highlights the canvas; canvas selection updates the
hierarchy and inspector. Numeric coordinates remain available in advanced
properties but are not the primary interaction.

## Assets

Task 4's `GameAsset` lifecycle remains authoritative. Upload is owner-scoped,
stream-limited, magic/MIME checked on the backend, installed atomically, and
finalized as immutable content. Objects reference asset IDs. Tombstoning blocks
new references; referenced bytes are never physically removed. Asset list,
search, preview, rename, category, upload progress, and dependency-aware delete
are real API-backed operations. Large previews are lazy-loaded.

## Story, events, mini-games, and scripts

Story is a dialogue/event module, not a game type. Dialogue choices can invoke
bounded actions, update variables, or change scene. The visual editor operates
on canonical event nodes directly; it never generates hidden JavaScript.

V2 extends triggers, conditions, actions, sequencing, delay, and bounded
branches/repetition. Every reference is semantically validated. Runtime event
execution has depth, step, time, and repeat budgets so cycles cannot freeze a
game.

Mini-games are project modules with typed input and `{ outcome, score,
rewards }` results. Initial implementations are Quiz, Puzzle, Memory,
Drag-and-Drop, and Reaction; each is introduced and tested before its control
is exposed. Events start modules and receive their results.

Scripts are canonical resources and attachments, never executable fields in an
event/component. The API validates size, language, references, and declared
capabilities but never executes source. Runtime execution occurs only inside
the already sandboxed game iframe through a narrow bridge such as variables,
scene changes, object spawn, audio, and dialogue. Host messages validate
origin/source, nonce, schema, size, and rate.

The audited codebase has no existing AI provider or AI API to reuse. The core
Studio therefore exposes no AI button or fake endpoint in this program. Typed
mutation batches form the future proposed-change boundary: a separately
approved AI integration may return a validated mutation proposal that the user
previews and applies item by item, but it may never overwrite the project.

## Runtime, preview, build, and publication

Editor, data, and runtime layers share schemas and pure semantic operations but
not UI components. A renderer/runtime interface is implemented with Canvas2D
first. Phaser or another engine requires a separate measured spike and review.

Playtest pins the current acknowledged or explicitly saved revision. It uses
the real unified runtime and packaged asset resolution, not a second preview
model. It supports scene selection, restart, diagnostics, variables, current
scene, event log, and optional FPS.

Build creation pins one exact revision and exact asset hashes. Public play
resolves only an approved immutable release/build. Draft edits and newer builds
cannot alter the public game. Legacy public resolution remains unchanged for
games without an engine release.

## Performance, security, and quality gates

- Pointer movement updates transient canvas state; canonical state changes once
  per committed gesture.
- Autosave is debounced and batched; large projects use typed partial mutation
  payloads instead of repeatedly uploading the full document.
- All mutation, asset, preview, build, and release routes enforce ownership or
  the documented moderator/admin role.
- Upload validation trusts neither filename nor browser MIME.
- Script source never executes in Node/API, build validation, or moderation.
- The iframe keeps sandbox isolation without `allow-same-origin`.
- Destructive actions use TFG confirmation UI, never browser alerts.
- Every exposed button has a working code path and test.
- Each implementation task begins with a focused audit, follows RED to GREEN,
  runs Task 1–5 compatibility regression, and commits only its own scope.

## Completion journey

The final fixture creates a new blank engine game, opens Studio, creates two
scenes, a map, player, two NPCs, dialogue, trigger, item, variable, and one
Quiz/Puzzle module. The player traverses Map → NPC dialogue → quest/item →
mini-game → success condition → scene transition. Reload restores exact state;
preview uses the saved revision; publish points public play to the approved
build; later draft edits do not change that public result. The four legacy game
lanes pass their existing creation, editing, preview, moderation, and play
regressions.
