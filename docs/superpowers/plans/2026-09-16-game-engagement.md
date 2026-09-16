# Game Engagement Implementation Plan

Use subagent-driven-development with explicit disjoint ownership and TDD.
Goal: real game activity/community data and separate creator analytics.
Architecture: dedicated engagement module + shared contracts; existing auth/publication invariants; browser telemetry stays in sandbox parent.
Tech stack: existing Nest/Prisma/Postgres, Next/React, Zod, Vitest/Playwright; no new dependencies.
Spec: docs/superpowers/specs/2026-09-16-game-engagement-design.md

- [x] API/contracts/data: read spec and source; failing contract/service/auth tests; additive models/migration; implement capability sessions, aggregates, community and settings; verify tests/types/lint. Publish stable contract promptly. Own apps/api,packages/contracts,packages/database only.
- [x] Web: read Nextdocs/spec; failing functional tests; detail community+metrics/share, analytics/chart/settings, creator links and moderation comments; responsive styles/errors; verify tests/types/lint. Own apps/web except game-player.tsx and play-telemetry helper/tests (root).
- [x] Root: failing launch/visibility/source-check tests; GamePlayer telemetry and helper; scoreintegrationdocs; disposable DB realHTTP+browser, migration upgrade.
- [x] Independent review each slice and integrated behavior; fix concrete findings.
- [x] Root: production build/backup/migrate/deploy/read-only live checks, report and cleanup. No real data mutation for tests.
