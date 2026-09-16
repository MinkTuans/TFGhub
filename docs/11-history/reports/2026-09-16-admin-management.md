# Admin users and games management — 2026-09-16

Status: verified locally; production build/deployment pending.

## Delivered scope

`/admin` now provides users, games, moderation and documents navigation. Previously the admin entry only opened the document library.

- Users: search/filter, ten per page, create/edit, password replacement, roles, lock/unlock, constrained deletion. Inactive users cannot log in or reuse existing sessions.
- Games: search/filter all owners, edit metadata/access/visibility/moderation, hide/quarantine and constrained deletion. Creation and approval use existing Studio/moderation flows.
- Responsive Vietnamese forms with explicit accessible labels, mobile editor scrolling, confirmations and unsaved-change protection including actual browser Back.
- Server authorization, fresh actor checks, stale-write protection and private DTOs. Self/last-admin safeguards and retained-history deletion constraints. Approved/pending metadata edits reset review and visibility; quarantine forces draft; publication requires approved ready clear content.
- Additive migration `20260916140000_admin_management`: active flag and administrative version on User. No real account/game changes required.

## Verification

- Contracts: 58 passed. API/auth focused: 63 passed. Web focused/access/library/navigation: 55 passed, plus final 10 management tests after label/mobile adjustments.
- API and web type checks and scoped lint passed; API production compile passed.
- Disposable PostgreSQL: fresh migration and populated upgrade both passed; existing admin/game preserved with active/version defaults.
- Real HTTP integration (`scripts/test-admin-management-api.mjs`): passed 27 authorization denials and user/game CRUD, lock/session/login, password replacement, stale/concurrent writes, self-protection, origin protection, all-owner filtering, publication reset/guard and history deletion constraints.
- Browser: guest/USER/MODERATOR server redirects; ADMIN user CRUD/role/lock/filter, game edit/quarantine/delete and draft protection passed at 390/1440 pixels in dark/light. Actual Back decline → save → Back accept passed; no page errors or horizontal overflow. Screenshots inspected.
- Full API regression initially had an archive-limit timeout under competing compilation load (231 passed, one timeout). The affected archive test file passed all 36 tests in an isolated rerun (13.32 seconds). No archive implementation changes made.
- Initial dev browser failure traced to the temporary proxy missing WebSocket upgrade support; direct Next and corrected proxy both work. This was test infrastructure, not product code.
- Independent API/UI review found no outstanding blocking issue.

Evidence: `/tmp/tfg-admin-management/` on the deployment host (ephemeral). All mutation tests used disposable data; production smoke will be read-only.

## Deployment

Pending build, consistent backup, additive migration, API/web switch and live checks.
