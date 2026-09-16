# Changelog

This release-oriented summary records major architecture/product milestones. It is not a deployment ledger; a development commit does not prove production rollout.

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
