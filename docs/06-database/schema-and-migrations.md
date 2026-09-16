# Database schema and migrations

TFGhub uses PostgreSQL 16 through Prisma 6. `schema.prisma` describes the client model; committed SQL migrations additionally enforce constraints and triggers that Prisma cannot express. Read both before changing persistence.

## Relationship map

```text
User ──1:0..1── DeveloperProfile
  └──1:N── Game ──1:0..1── EngineProject
                         ├──1:N── EngineProjectRevision
                         ├──1:N── EngineProjectMutation
                         └──1:N── GameAsset

Game ──1:N── GameBuild ──1:N── GameRelease
Revision ──N:M── Asset (EngineRevisionAsset)
Build    ──N:M── Asset (GameBuildAsset)
Release  ──0..1── origin Release (rollback lineage)
```

## Core models

- `User`: identity, password hash, role, owned games, authored revisions/builds/releases.
- `DeveloperProfile`: one-to-one public creator identity.
- `Game`: product metadata, source type, legacy `projectData`, artifact/cover/review state, and optional current release pointer.
- `EngineProject`: one-to-one ENGINE aggregate for a game and its head revision number.
- `EngineProjectRevision`: immutable canonical JSON document, schema version, content hash, size, retention, and author.
- `EngineProjectMutation`: idempotency receipt mapping `(projectId, mutationId)` to a result revision.
- `GameAsset`: project-owned immutable content identity plus mutable display metadata and lifecycle state.
- `EngineRevisionAsset` and `GameBuildAsset`: join asset ID and content hash so historical references cannot drift.
- `GameBuild`: binds a game to exactly one ENGINE revision or legacy artifact version and records runtime/diagnostics.
- `GameRelease`: review/publication record bound to a build from the same game, with optional rollback origin.

## Enums and lifecycle

Roles: `USER`, `MODERATOR`, `ADMIN`. Source types: `UPLOAD`, `CODE`, `STORY`, `PLATFORMER`, `ENGINE`. Asset states: `UPLOADING`, `READY`, `TOMBSTONED`, `GC_PENDING`. Build and release enums describe intended durable lifecycle states, but the complete ENGINE build/release executor is not implemented.

## SQL-only invariants

Migrations enforce more than the Prisma file shows, including:

- cover metadata and viewport consistency checks;
- exactly one ENGINE revision or legacy artifact source per build;
- same-game build/release references;
- a deferrable Game → current published release foreign key;
- at most one published release per game through a partial unique index;
- mutation base/result revision validity;
- asset lifecycle, immutable identity, and retained-reference triggers.

Do not infer the production schema from `schema.prisma` alone.

## Migration history

| Migration | Purpose |
| --- | --- |
| `20260905105856_initial_domain` | Accounts, profiles, initial games/catalog |
| `20260907060000_game_builds` | Legacy source/review plus build/release foundation |
| `20260907070000_artifact_readiness` | Artifact readiness state |
| `20260907190000_game_covers` | Versioned cover metadata and viewport |
| `20260909090000_engine_core_phase_1` | Engine projects, revisions, assets, builds, releases, SQL constraints |
| `20260909093000_engine_game_source` | Additive ENGINE source type |
| `20260909100000_engine_project_mutations` | Durable mutation idempotency receipts |
| `20260909110000_game_asset_metadata` | Asset metadata/lifecycle and integrity triggers |

## Change rules

Add a new migration for every schema change. Never edit an applied historical migration. Verify Prisma validation, an empty-database migration, upgrade behavior where relevant, and database integration tests. Dedicated integration suites skip unless `ENGINE_CORE_TEST_DATABASE_URL` or `ENGINE_GAME_SOURCE_TEST_DATABASE_URL` is configured.
