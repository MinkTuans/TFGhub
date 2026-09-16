# Administrator user and game management

User reports that admin currently exposes only project documentation and asks for user/game management. Existing ADMIN CRUD preference and deployment authorization persist. Deliver users/games first; optional clarification about further sections is pending and must not block these sections.

## Navigation and UI

`/admin` becomes an ADMIN-only management landing page linking Người dùng, Game, Kiểm duyệt and Tài liệu. Shared admin navigation is present on admin pages; main site admin link targets `/admin`. New `/admin/users` and `/admin/games` SSR-protected pages use searchable/filterable paginated lists (10 per page), detail/edit forms, pending/error feedback and destructive confirmations. Mobile uses stacked cards/forms without body overflow. All labels Vietnamese, both themes. Preserve draft on failure and confirm abandonment. Do not modify the recently delivered library pagination/slider.

Users: list/search by email or profile name, role and active filter, create with password, edit email/display name/role/active state and optional replacement password, delete only accounts with no owned games or historical authorship/build/release references. Cannot disable/demote/delete self or remove the last active ADMIN. Never return password hashes or tokens. Fresh login and existing authenticated requests reject inactive accounts.

Games: list all owners/states (not only current owner or pending moderation); query title/slug/owner email, filter owner/review/moderation/visibility. Edit title, description, access mode, visibility and moderation state. Admin metadata edits to pending/approved games reset review to DRAFT, visibility DRAFT and review timestamps/note, matching existing creator invariant. Setting FLAGGED or QUARANTINED forces visibility DRAFT; clearing moderation does not auto-publish. Setting PUBLIC requires already-approved, ready artifact and CLEAR moderation; no bypass of review/build invariants. Do not mutate engine revisions, publication pointers or artifact metadata through the admin form. Link to existing moderation page for approve/reject; link to Studio new-game flow for creating a game under the current admin. Delete using expected updatedAt and block games with builds/releases; translate remaining FK restrictions into409 and offer hide/quarantine as alternative. Preserve immutable stored artifacts rather than deleting disk paths in this task.

## Persistence and concurrency

Add User.isActive boolean default true and User.adminVersion integer default1 using an additive migration. Map adminVersion to public version. User admin mutations are transactional, serialized with a PostgreSQL advisory lock; recheck actor ADMIN/active and target, protect current/last admin and use version predicates. Lock target user row for deletion so concurrent owned-game creation cannot race an empty-account check. All target relations must be checked before deletion to prevent existing cascade from silently deleting games.

Game mutations use updatedAt predicates/row lock, preserve existing owner workflow and publication invariants. Delete/modify conflicts409, missing404, invalid400, duplicate email409. Requests require fresh JWT auth + ADMIN-only guard; USER/MODERATOR forbidden; Origin protection remains global. GET private,no-store.

## API contract

GET/POST `/admin/users`; GET/PATCH/DELETE `/admin/users/:id`.
GET `/admin/games`; GET/PATCH/DELETE `/admin/games/:id`.
Shared schemas/types in packages/contracts/src/admin-management.ts (coordinator-owned); implementation consumes those exact schemas. User delete body {version}; game delete body {updatedAt}. List response {items,total}. No arbitrary role mutation public endpoint.

## Verification/delivery

TDD contracts, service/HTTP authorization/invariants, UI filters/forms/errors. Disposable PostgreSQL integration for migration preservation, create/edit/block/login/role/delete, game metadata/publication safeguards and stale writes; test no production mutations. Browser mobile/desktop including admin/library navigation. Independent review, production builds, validated backup, additive migration, API/web deploy, read-only live smoke. Do not alter real users/games for tests.
