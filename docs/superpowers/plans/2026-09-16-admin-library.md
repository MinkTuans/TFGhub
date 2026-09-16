# Admin library implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent API/UI tasks with final integration review.

**Goal:** ADMIN manages categorized website/project documentation entirely on web with persistent CRUD.
**Architecture:** PostgreSQL library + guarded Nest API + responsive Next reader/editor; explicit one-time docs import.
**Tech Stack:** Existing Prisma/PostgreSQL, Nest, Zod, Next/React; react-markdown + remark-gfm for safe rendering.
**Spec:** docs/superpowers/specs/2026-09-16-admin-library-design.md

## Constraints

ADMIN only; all Vietnamese UI; no executable/source writes; immutable sourcePath; integer version optimistic concurrency; empty-category-only delete; edits/deletes survive redeployment; existing docs imported once; additive migration; source packages remain separated.

## Task 1 — contracts, persistence and import (coordinator)

Files: packages/contracts/src/admin-library.ts, admin-library.spec.ts, index.ts; packages/database/prisma/schema.prisma + new migration; scripts/seed-admin-library.mjs, admin-library seed tests.

- [x] Red tests: strict field validation, content/category/title limits, positive version, bounded query pagination.
- [x] Implement shared schemas/types named AdminCategoryInput, AdminCategoryUpdateInput, AdminDocumentInput, AdminDocumentUpdateInput, AdminDeleteInput, AdminDocumentsQuery; response types AdminCategory, AdminDocumentSummary, AdminDocument, AdminDocumentList.
- [x] Create AdminCategory(id cuid, name, description default empty, version default1, timestamps), AdminDocument(id cuid, categoryId FK RESTRICT, title,content,sourcePath nullable,version default1,timestamps,index categoryId), AdminLibraryState(id primary key,createdAt).
- [x] Explicit transactional seed reading docs with path/extension allowlist, advisory lock, marker project-docs-v1. No re-seeding after marker. Test repeat after edits/deletes on disposable DB.
- [x] Generate Prisma client, build contracts; verify fresh migration and upgrade of populated disposable database.

## Task 2 — guarded API CRUD (API implementer)

Files: apps/api/src/admin-library/*, apps/api/src/app.module.ts.

- [x] Red service/HTTP tests for spec routes, ADMIN-only access, missing IDs, malformed input, stale version, nonempty categories and cross-origin rejection.
- [x] Implement module with AuthModule, AdminOnlyGuard, controller and focused service/repository following existing dependency injection style.
- [x] Transactions use id+version predicates, increment version on update, FK errors translated to conflict; GET list summaries excludes content, individual read includes content. POST sourcePath remains null.
- [x] Run focused tests and typecheck, then report for review.

## Task 3 — web reader/editor (UI implementer)

Files: apps/web/app/admin/**, components/admin-library/**, relevant nav links, lib/api-client.ts delete method, tests/admin-library*.

- [x] Red UI tests for role gating, category/doc CRUD controls, validation, pending/error feedback and unsaved content preservation.
- [x] Server session gate for ADMIN; separate page under /admin/library. Query API list/category on SSR. Add navigation entry.
- [x] Responsive category panel, document list/search/pagination and reader; forms create/edit documents and categories, confirmations for deletion, unsaved navigation guard. Markdown with tables/code/link handling, no raw HTML. Read-only source provenance shown.
- [x] Frontend consumes exact API/types in spec; add delete helper preserving existing fetch/error contract. Test 409 keeps draft and offers reload, disabled controls while pending.
- [x] Run focused tests, lint, build/typecheck, report for review.

## Task 4 — integrated verification and delivery (coordinator/reviewer)

- [x] Review API/UI against spec and security, fix confirmed defects.
- [x] Disposable PostgreSQL real API sessions: USER/MODERATOR403, ADMIN full CRUD, stale409, category nonempty409, persistence and seed idempotence; browser CRUD plus Markdown safety and mobile/desktop screenshots.
- [ ] Tag running API+web rollback images BEFORE build; production Docker build API+web; consistent backup via runbook.
- [ ] Apply additive migrations, run seed explicitly once, deploy API+web, verify health and library authorization without altering live user roles.
- [ ] Record release images/backup/tests in docs/11-history/reports/2026-09-16-admin-library.md. Commit code and evidence; do not repeat deploy from future scheduled wakeup once complete.
