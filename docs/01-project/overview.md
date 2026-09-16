# Project overview

TFGhub is a Vietnamese platform for building and publishing small browser games. The UI brand is **TFG**; technical identifiers such as workspace packages, cookies, database defaults, and volumes retain the older `indieforge` name for compatibility.

## Product goals

- Let creators build or upload browser games without operating their own hosting.
- Keep mutable authoring state separate from immutable playable artifacts.
- Require ownership and moderation checks at the API boundary.
- Run creator content inside a restricted browser sandbox.
- Evolve toward one canonical ENGINE document without breaking existing games.

The legacy path supports HTML5 ZIP uploads, code projects, interactive stories, and platformer projects. These can be built, previewed, submitted, moderated, published, discovered, and played.

The ENGINE path supports V2 project documents, revisions, mutation batches, browser recovery, scene editing, hierarchy, Canvas2D preview, and project assets. It does not yet have a complete production build/release runtime. See [current capabilities](../03-features/current-capabilities.md).

## Technology stack

- Node.js 22, package-local TypeScript 5/6 toolchains, pnpm 10, and Turborepo 2
- Next.js 16.3.4, React 19.2.8, and Tailwind CSS 4
- NestJS 12 on Express
- Zod shared contracts and engine schemas
- Prisma 6 with PostgreSQL 16
- Vitest, Testing Library, and Playwright
- Sharp 0.35.4 as a direct API dependency for image metadata and thumbnails
- Docker/Compose and Caddy for the single-host production baseline
