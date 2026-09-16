# Changelog

This release-oriented summary records major architecture/product milestones. It is not a deployment ledger; a development commit does not prove production rollout.

## 2026-09-16 — Moderation presentation and broad UI audit (development only)

Review queue now shows actual pending count, readable UTC submission dates, separate preview/decision areas and an explicit empty state. Review concurrency payloads and authorization remain unchanged. Scoped preview sizing avoids inherited oversized frames on mobile. Full frontend unit473/473 and production browser58/58 passed; final sizing regression4/4 passed after rebuild. Full lint retains one existing warning. Real ENGINE/assets integration remains open in the [plan](../superpowers/plans/2026-09-16-ui-remaster.md). No deployment.

## 2026-09-16 — Creator dashboard and management presentation (development only)

Studio now searches and filters real owner games, sorts by update/name and distinguishes empty results from an empty account. Card data excludes full project payloads across the client boundary. Creation guidance preserves the single-click blank ENGINE flow; legacy management adds section navigation. Verified46 focused unit tests,9 production-browser checks across four widths and both themes, changed-file lint and production build. No deployment; moderation and final audit remain in the [plan](../superpowers/plans/2026-09-16-ui-remaster.md).

## 2026-09-16 — Accounts/profile remaster (development only)

Added responsive split account forms, password visibility/confirmation and a separate profile save after registration, with retry that never repeats a successful account creation. Profile uses real owner data and private workspace links. Scoped streaming skeletons to protected routes to restore public no-JavaScript rendering and unpublished-game HTTP404; search retains native GET with client progress. Verified59 unit and29 production-browser tests, clean changed-file lint and successful build. Remaining Studio/moderation/final audit scope is recorded in the [plan](../superpowers/plans/2026-09-16-ui-remaster.md). No deployment.

## 2026-09-16 — Recoverable routes and catalog remaster (development only)

Added loading skeletons and page/root error recovery using Next's re-fetching retry, verified against controlled API failures in the production browser build. Discover now has explicit responsive columns, contextual result counts and shared empty states; game details show existing public metadata beside the preserved sandbox player. No production API/schema/session changes. Validation and remaining remaster scope: [plan](../superpowers/plans/2026-09-16-ui-remaster.md).

## 2026-09-16 — UI remaster foundation (development only)

Added warm light-mode colors, wider shared content containers, a structured Home hero and actual catalog empty/error states, role-aware footer links, and mobile navigation with keyboard/history handling. Dark/system theme preferences, routes and API/authentication remain intact. This is the first layer of the broader remaster, not a completed redesign or deployment. Progress and exact verification caveats: [remaster plan](../superpowers/plans/2026-09-16-ui-remaster.md).

## 2026-09-10–11 — Immutable Studio assets

Added owner-scoped asset upload, metadata, content/thumbnail reads, tombstoning, integrity validation, and Studio Asset Manager interactions. Hardened upload reservation identity. Evidence: `1860920`, `a4fca5d`, `abcd315`, `1c43155`, `f2cdc9d`.

## 2026-09-09 — Unified Game Studio foundation

Added canonical Engine Project V2, deterministic V1 upgrade, `ENGINE` source type, revisions, idempotent mutations, conflict handling, recovery, Studio shell, scene/layer/object/component editing, Canvas2D rendering, hierarchy, and inspector. Legacy sources remain supported. Evidence includes `6fd3693`, `24eb90b`, `06c4828`, `f71470d`, `89279fe`, `c522334`, `21df6d5`, `cac0aa7`, `9674be6`.

## 2026-09-08–09 — Engine core and revision persistence

Introduced canonical project/event schemas, deterministic legacy adapters, engine lifecycle tables, and owner-authorized project revision persistence. Evidence: `cd87a48`, `5c6b635`, `d19f26f`, `48df997`, `d0de2ea`.

## 2026-09-07–08 — TFG desktop experience

Introduced TFG themes/design system, redesigned catalog and workflows, guarded AdSense slots, immersive player, and versioned atomic game covers. Evidence includes `d93e856`, `c695f79`, `0d1ea9d`, `17d2251`, `224e184`, `8e71b5b`, `50929d`, `3845dc6`.

## 2026-09-07 — Publishing, builders, moderation, and artifacts

Added upload, code, story, and platformer authoring; safe compilation/storage; capability delivery; review transitions; moderation UI; public play; and durable immutable artifacts. Evidence includes `7f54009`, `1e15709`, `796f539`, `b8138bc`, `037f4c2`, `8e0f800`, `5ac36ab`, `4dfbd7b`, `047d9c1`, `7d30467`.

## 2026-09-06–07 — Production deployment

Added Node application images and the PostgreSQL/migration/API/web/Caddy Compose stack, private service routing, deployment checks, backup, clean restore, and HTTP-preview cookie configuration. Evidence: `0845996`, `fd72b59`, `3d9920a`, `d1cfd6a`, `ba7b5a4`, `c42d389`.

## 2026-09-05 — Platform foundation

Created the monorepo with Next.js, NestJS, Zod contracts, Prisma/PostgreSQL, Vitest, and Playwright. Added cookie authentication, profiles/drafts, public discovery, catalog UI, and trusted-origin mutation protection. Evidence: `1ced7d0`, `4b9e7bc`, `2d0ff7b`, `0a727ab`, `d742735`, `b1d18d9`, `722a7cd`.

## Separate operational history

The `ops/install-second-bot` branch records host-specific Codex bot work (`47a2759`, `cadc3aa`, `9e84097`, `9e77c89`). These commits are not ancestors of the application branch and do not prove current service health.
