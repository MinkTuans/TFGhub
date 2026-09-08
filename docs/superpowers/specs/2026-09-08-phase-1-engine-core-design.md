# Phase 1 Engine Core Design

## Status and scope

This specification is approved for implementation planning. Phase 1 establishes
the versioned engine document, legacy adapters, draft/build/release separation,
asset persistence, and a sandbox asset-loading spike. It does not add the large
editor UI, Phaser, React Flow, or a production rollout.

The existing `Game` remains the public catalog identity. A game has at most one
engine authoring project and any number of immutable revisions, builds, and
release-history records. `UPLOAD` and `CODE` remain legacy lanes. Existing
artifacts are never rebuilt with the new runtime.

## Canonical project document

`EngineProjectV1` contains:

- `schemaVersion: 1`, a stable `projectId`, `engineFamily: "TFG_ENGINE"`, and a
  stable `entrySceneId`;
- bounded viewport settings;
- ordered scenes with stable IDs;
- ordered objects with stable IDs, optional stable parent references, enabled
  state, and component instances;
- typed global, player, and scene variables;
- project-level typed events; and
- prefabs with stable IDs.

Component instances contain a stable ID, component type, component version,
and validated properties. The initial registry contains `Transform`, `Sprite`,
`Physics`, `Animation`, `Movement`, `Health`, `Collectible`, `Enemy`, `Portal`,
`Dialogue`, `Audio`, and `Text`. Each registry entry owns defaults, a Zod
property schema, contextual validation, a runtime-handler key, and versioned
migrations. Phase 1 defines handler keys but does not implement a Phaser
runtime.

Stable IDs are opaque UUID strings. Rename and reorder never change an ID;
duplicate creates new IDs for the copied subtree. Assets are referenced only
by `assetId`; canonical documents contain no storage path, URL, or base64
binary.

Readers return an explicit discriminated result: supported documents return a
validated canonical value; malformed documents return diagnostics and retain
the raw input; a `schemaVersion` newer than supported returns
`UNSUPPORTED_FUTURE_SCHEMA`, retains the raw input byte-for-byte at the API
boundary, and is read-only. No failure path substitutes a default project.

## Event schema

`GameEventV1` contains a stable ID, `version: 1`, name, enabled state, order,
one trigger, an optional condition expression, and a non-empty ordered action
list. Triggers are a discriminated union:

- `GAME_START`;
- `COLLISION` with two object references;
- `CLICK` with an object reference;
- `KEY_PRESS` with a bounded key and repeat policy;
- `TIMER` with bounded delay, repeat, and interval;
- `DIALOGUE_END` with an object/component reference; and
- `CHOICE_SELECTED` with dialogue object and stable choice references.

Conditions are stable, versioned nodes supporting bounded-depth `ALL`, `ANY`,
and `NOT`, plus typed `COMPARE_VARIABLE`, `OBJECT_EXISTS`, and `HAS_COMPONENT`
leaves. Actions are stable, versioned nodes supporting `CHANGE_SCENE`,
`MOVE_OBJECT`, `CREATE_OBJECT`, `DESTROY_OBJECT`, `PLAY_ANIMATION`,
`PLAY_AUDIO`, `CHANGE_VARIABLE`, `ADD_SCORE`, `CHANGE_HEALTH`, and
`SHOW_DIALOGUE`. `CREATE_OBJECT` references a prefab; no event contains
arbitrary executable code.

Semantic validation proves unique IDs, valid scene/object/component/asset/
prefab targets, valid variable scope and value type, component compatibility,
finite numeric values, non-empty actions, and explicit resource limits.
Potential cycles are diagnostics rather than schema rejection; the later
runtime must also enforce an event-execution budget.

## Deterministic legacy identity

Legacy STORY and PLATFORMER adapters derive UUIDv5 IDs from one permanently
documented TFG namespace UUID and UTF-8 identities rooted in immutable
`gameId`. Examples are:

```text
game:<gameId>:project
game:<gameId>:story:scene:<legacySceneId>
game:<gameId>:story:scene:<legacySceneId>:choice:<choiceIndex>
game:<gameId>:platformer:scene:main
game:<gameId>:platformer:object:player
game:<gameId>:platformer:object:goal
game:<gameId>:platformer:object:platform:<platformIndex>
```

UUIDv5 SHA-1 is used only for standardized deterministic identity, not for a
security decision. Adapters never use mutable title or slug. Repeated adapter
runs over the same game and source are byte-identical. The first persisted
canonical revision retains these IDs permanently, so later reorder operations
do not rerun index-based identity derivation. Invalid legacy data produces
diagnostics and is not silently repaired. CODE and UPLOAD are not adapted.

## Database model

Model names follow the existing singular PascalCase Prisma convention. Module
folders follow the existing lowercase plural Nest convention.

### Ownership and cardinality

- `Game` has zero or one `EngineProject`; `EngineProject.gameId` is unique.
- Ownership is derived only through `EngineProject.game.ownerId`; it is not
  duplicated on the project.
- `EngineProject` has many revisions and assets.
- `Game` has many builds and release-history rows.
- `Game.currentPublishedReleaseId` is the nullable current-release pointer.

The current pointer must not be modeled as a naive independent one-to-one
relation. PostgreSQL receives a composite foreign key from
`Game(id, currentPublishedReleaseId)` to `GameRelease(gameId, id)`, backed by a
composite unique key on `GameRelease(gameId, id)`. This makes a cross-game
pointer impossible. No standalone unique constraint is added to
`currentPublishedReleaseId`. A partial unique index on `GameRelease(gameId)`
where state is `PUBLISHED` enforces at most one published history row per game.
All historical `SUPERSEDED` and `REJECTED` rows remain. Because Prisma cannot
fully express the deferrable composite pointer and partial unique index, the
scalar pointer is represented in Prisma and the exact constraints are created
and contract-tested in additive SQL.

The intended SQL shape is explicit:

```sql
ALTER TABLE "GameRelease"
  ADD CONSTRAINT "GameRelease_gameId_id_key" UNIQUE ("gameId", "id");

CREATE UNIQUE INDEX "GameRelease_one_published_per_game"
  ON "GameRelease" ("gameId")
  WHERE "state" = 'PUBLISHED';

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_current_published_release_fkey"
  FOREIGN KEY ("id", "currentPublishedReleaseId")
  REFERENCES "GameRelease" ("gameId", "id")
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;
```

`GameRelease.gameId -> Game.id` continues to use `ON DELETE CASCADE`. The
deferred pointer constraint lets deletion of a Game and its release history
complete atomically. In Prisma, `Game.currentPublishedReleaseId` remains a
nullable scalar and release history uses the ordinary `GameRelease.game`
relation; code resolves the current release explicitly. This avoids Prisma
generating a misleading one-to-one relation or standalone unique index.

### Models

- `EngineProject`: `id`, unique `gameId`, `headRevisionNumber`, timestamps.
- `EngineProjectRevision`: project, unique revision number per project,
  `schemaVersion`, JSONB document, SHA-256 content hash, byte size, retention
  class (`STANDARD` or `PINNED`), author, timestamp.
- `GameAsset`: project, stable asset ID, kind, display name, lifecycle state,
  immutable storage key and SHA-256 content hash, MIME, byte size, optional
  dimensions/duration, timestamps and tombstone time.
- `EngineRevisionAsset`: composite revision/asset reference.
- `GameBuild`: game, optional exact engine revision or imported legacy artifact
  version, build state, runtime family/version, manifest/hash/diagnostics,
  creator and timestamps. Exactly one source form is allowed.
- `GameBuildAsset`: composite build/asset reference plus the asset
  `contentHash` captured at build creation. A composite foreign key from
  `(assetId, contentHash)` to immutable `GameAsset(id, contentHash)` prevents a
  build from claiming a different asset version. The build manifest repeats
  the hash and packaged artifact-relative path.
- `GameRelease`: game, exact build, state, submitter/reviewer, review note,
  optional rollback origin release, and lifecycle timestamps.

Existing `Game.projectData`, artifact, visibility, and review columns remain
during the compatibility window.

`GameAsset` therefore declares a composite unique key on `(id, contentHash)`,
and `GameBuildAsset` has primary key `(buildId, assetId)` plus the three-column
relation identity `(buildId, assetId, contentHash)` in its immutable manifest.
Changing a `GameAsset.contentHash` after READY is forbidden; replacing bytes
creates a new asset ID.

## Revision lifecycle and concurrency

Phase 1 stores full JSONB snapshots. A save carries `baseRevision`; validation
and hashing run before the transaction, then one database transaction checks
ownership, conditionally advances `headRevisionNumber`, inserts the immutable
revision and its asset-reference rows, and commits. A stale base returns
`409 PROJECT_REVISION_CONFLICT` without overwrite or automatic merge.

`PINNED` revisions and revisions referenced by any build are never compacted.
The first materialized legacy revision is pinned. At most the newest 100
unreferenced `STANDARD` revisions remain per project. Best-effort compaction
runs after a successful save in a separate transaction; compaction failure
does not fail the save. Full named-version policy remains Phase 7 scope.

## Asset lifecycle

Assets transition `UPLOADING -> READY -> TOMBSTONED -> GC_PENDING`, followed by
physical deletion. Upload first reserves an authorized database record, then
validates and atomically installs immutable bytes beneath
`project-assets/<projectId>/<assetId>/<contentHash>/source`, then conditionally
marks the row ready. Reconciliation handles lost database responses.

Only READY assets belonging to the same project may enter a revision or build.
Tombstoning blocks new references but preserves metadata and bytes. Garbage
collection may remove bytes only when no `EngineRevisionAsset`, no
`GameBuildAsset`, and no in-flight storage operation refers to the asset.
Consequently old revisions and every build/release remain reproducible.

## Build and release state machines

Build states are `QUEUED -> BUILDING -> READY|FAILED`; queued/building builds
may become `CANCELLED`. Only the game owner may build. Build creation pins the
exact revision and copies `(assetId, contentHash)` references in one database
transaction. Compilation and atomic filesystem installation occur outside the
transaction; a final conditional transaction records immutable manifest and
hash. Draft builds never alter the public release.

Release states are `PENDING_REVIEW -> PUBLISHED|REJECTED`; publishing a newer
release changes the prior published row to `SUPERSEDED` in the same transaction.
The owner submits a READY build. MODERATOR or ADMIN may approve/reject. Only
approval publishes. Only ADMIN may roll back, with a mandatory reason; rollback
creates a new published release record referencing a formerly published build
and records `originReleaseId`, rather than rewriting history. Quarantine remains
an independent public-play gate.

Publication locks the game and pending release, validates reviewer authority
and READY build ownership, supersedes the old current row, publishes the new
row, updates the composite-safe current pointer, and commits without filesystem
work.

## Sandbox asset-loading spike

The current CSP remains unchanged until a browser spike measures it. A small
artifact fixture tests inline manifest data, relative image/audio/CSS/module
resources, blocked `fetch("./project.json")`, null-origin isolation, capability
expiry, and draft/build changes while an older release remains public.

The initial design embeds project/asset manifest data in bootstrap HTML and
loads packaged assets through capability-relative paths. Capability tokens are
bound to immutable build IDs rather than mutable game artifact counters. If
late loading after the five-minute expiry fails, the preferred follow-up is a
parent-mediated capability renewal protocol with `event.source`, nonce, schema,
size, and rate validation. `allow-same-origin` is never added. CSP is widened
only if the spike demonstrates a specific unavoidable requirement.

## Migration and rollback

The migration is additive and does not edit historical migrations or remove
legacy columns. Before applying it, inventory database rows and storage,
capture one consistent PostgreSQL plus complete game-storage backup, and prove
restore in an isolated namespace. SQL migration creates tables, indexes,
checks, the composite current-release foreign key, and partial published-row
index; it does not convert JSON.

A separate dry-run adapter reports diagnostics and hashes before materializing
valid STORY/PLATFORMER projects. Metadata-only public games remain metadata-only.
When `artifactReady=false`, no source-to-artifact provenance is invented.
Existing artifacts become build records only after filesystem existence and
hash verification; no artifact is rebuilt. CODE and UPLOAD remain legacy.
Application rollback continues to read the expanded schema, and no contraction
migration occurs in Phase 1.

## Verification requirements

Tests cover canonical/event validation, deterministic UUIDv5 golden vectors,
legacy golden adapters, future-schema read-only preservation, real-PostgreSQL
CAS conflicts and constraints, revision retention, asset ownership/tombstone/
GC/reference hashes, build provenance, publication atomicity/rollback, current
release composite ownership, sandbox CSP behavior, migration/restore, and all
four legacy creation/play paths.
