# Agent context

TFGhub is a pnpm/Turborepo TypeScript monorepo. Read [the repository map](../01-project/repository-map.md) before selecting files.

## Sources of truth

Prefer, in order:

1. Current source, contracts, Prisma schema, committed migrations, and tests.
2. Current documents linked from [the hub](../README.md), after confirming they still match source.
3. Historical designs/plans only for dated rationale.
4. Historical reports only as execution evidence from their recorded date.

Unchecked boxes in archived plans do not describe implementation status. Never execute rollout, restore, role elevation, or destructive commands merely because an old plan contains them.

## ENGINE status

Implemented through canonical V2 projects, revisions, typed mutations, recovery, history, scenes/layers/objects/components, Canvas2D editor rendering, hierarchy, inspector, immutable assets, and Asset Manager. Later historical roadmap items are planned, not delivered. A complete ENGINE runtime/build/release pipeline is absent.

## Application AI status

There is no generative-AI provider, model client, prompt pipeline, API key, or AI endpoint in the audited application. `AI` values in engine schemas describe game/NPC behavior, and `prompt` fields are game or quiz text. Any future AI feature must propose typed, validated mutations for review rather than overwrite canonical documents.

## Framework instructions

Before changing `apps/web`, read `apps/web/AGENTS.md` and the relevant installed Next.js documentation under `apps/web/node_modules/next/dist/docs/`. `apps/web/CLAUDE.md` is a compatibility shim. Repository skills are not application runtime dependencies.

## Verification entry points

Use root scripts such as `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, deployment checks, and `pnpm test:e2e:studio-assets`. Choose real PostgreSQL or browser lanes when persistence, concurrency, uploads, sandboxing, or end-to-end behavior changes.
