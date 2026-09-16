# Admin management implementation plan

Use subagent-driven-development for API and UI slices with scoped ownership.

- [x] Coordinator: shared schemas/types + validation tests, disposable PostgreSQL and integration harness.
- [x] API implementer: users/games admin API, additive user migration, inactive-account auth behavior; focused tests and typecheck. Own apps/api, Prisma schema/migration only.
- [x] UI implementer: shared admin navigation/landing/users/games pages, forms and responsive CSS; tests/lint. Own apps/web only.
- [x] Reviewer: independent backend/UI review against design, fix specific findings, final integration review.
- [x] Coordinator: browser functional/read-only verification, production builds, backup/migration/deploy, live smoke and completion report.

Spec: docs/superpowers/specs/2026-09-16-admin-management-design.md.
