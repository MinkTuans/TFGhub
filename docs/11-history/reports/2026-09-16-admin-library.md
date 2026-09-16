# Administrator information/document library — 2026-09-16

User approved full ADMIN CRUD for a categorized website/project documentation section, accessible without opening source code. `/admin/library` provides category and document create/read/update/delete, search, pagination, Markdown read/preview and source-relative imported links. Existing role-gated navigation adds “Quản trị website”.

The library is a persistent editable PostgreSQL copy of repository docs, not a source-code/configuration editor. Imported sourcePath is immutable provenance. An explicit atomic seed uses the project-docs-v1 marker and advisory lock; repeated deploys preserve admin edits/deletions. Category deletion requires moving/removing its documents. Version checks prevent concurrent lost updates. Raw HTML/unsafe links are not executed. Unsaved edits prompt before leaving, logout or Back.

## Verification

- 5 contract validation tests, 2 seed filesystem tests and 35 API service/HTTP tests passed. API TypeScript and oxlint passed.
- Disposable PostgreSQL: complete fresh migration plus populated-database upgrade passed. Sentinel user survived; 53 source docs imported once under concurrent seed calls; edited/deleted entries remained edited/deleted after repeat seed; FK restricts category removal.
- Real API/database integration passed all 27 guest/USER/MODERATOR endpoint denial cases, ADMIN CRUD, search/source lookup, concurrent write200/409, stale delete409, nonempty category409, immutable provenance rejection400, cross-origin403 and fresh DB role revocation403.
- Final admin UI tests: 20 passed. Existing API-client/app-shell tests also passed in an earlier overlapping 54-test group. Do not sum overlapping groups. Targeted web lint and TypeScript passed.
- Production browser functional smoke: 8 scenarios passed — 3 role-gated web routes, full category/document CRUD at390/1440px in dark/light, safe Markdown/table/code layout, preview, persistence after reload, search, unsaved cancel and actual Back/logout confirmations. A separate actual-browser save→Back check also passed.
- Browser initially identified populated textarea/select label names incorporating their text; separate label/control associations fixed it, with regression test. The form itself was present; no history logic bug was found.
- Screenshot inspection identified global CTA styles overriding local library choices and wrapping counts. Scoped opt-out classes, stronger selection styles and nowrap/nonshrinking counts fixed this; final Docker image passed six visual/navigation cases at 320/390/1440px in dark/light, including relative document links and no horizontal overflow.
- Independent backend/data and frontend reviews found no remaining blockers, with scoped review of the label correction.
- Local API and web production builds passed. API Docker log fully completed image export, although the tool process reported143 afterward. Image source hashes match; booting that image and real login/role checks independently passed. Final web Docker build completed successfully (exit 0).

## Deployment

Completed on 2026-09-16 at approximately 12:22 UTC, implementation commit `7502724`.

- Validated consistent backup prefix: `backups/20260916T122157-710397` (database dump, artifacts archive and checksums).
- Applied additive migration `20260916120000_admin_library`, then explicitly seeded 12 categories and 53 documents. Durable seed marker confirmed.
- Deployed API image `sha256:50c9b96ab9460dbd95fdd201c6e0a95d7854bc03a1c8eea9af370e386541dd25` and web image `sha256:65b59f2f6b747a6c6d09abc94c21e306f4c5e1261f1f3477185837a77c02319b`; running image identities verified. API, web, proxy and database healthy; public `/api/health` returned 200.
- Live read-only browser smoke passed at 390/1440px in dark/light: ADMIN reader/navigation and CRUD controls, source document lookup, category API and private/no-store headers, no horizontal overflow or browser errors. Guest page/API protection passed. Evidence: `/tmp/tfg-admin-library/live.log` and live screenshots.
- No production user roles or game records were changed, and no test records were created. Full write-path CRUD was verified against disposable PostgreSQL before release; live checks were read-only.

Task complete. Future scheduled wakeups must not repeat deployment or tests for this release. Completion documentation is a docs-only change and requires no new deployment.

Evidence and helper scripts: `/tmp/tfg-admin-library`. Root plan ledger: `.superpowers/sdd/2026-09-16-admin-library/progress.md`.
Rollback images were tagged before builds: `indieforge-api:rollback-before-admin-library-20260916` (`sha256:11c88ab7d5e2a892132ddada8fe79a9df5c841b96c0e8ec2288033a668243b16`) and `indieforge-web:rollback-before-admin-library-20260916` (`sha256:d8ec7bcf5830112c535c60325bba9b28d6dd816a73bd16ae2d357663d6d34ffb`).
