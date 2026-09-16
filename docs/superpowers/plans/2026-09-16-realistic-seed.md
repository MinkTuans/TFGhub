# Realistic Vietnamese community seed

Authorized: user requests seeded 30 Vietnamese accounts and 10 distinct playable games, existing schema only, linked varied activity visible in UI. Existing live update authorization applies to this additive dataset; do not alter any existing rows. No schema/runtime logic changes.

Design: deterministic seed IDs and reserved email namespace, natural DeveloperProfile display names. 10 CODE projects with genuinely different mechanics, existing sandbox/score bridge. Categories recorded in description since no category column. No revenue/avatar/username storage invented. Rating lacks timestamp; comments/plays and output metadata have chronological dates. GamePlay/GameScore are source of activity aggregates; participant HMAC matches current API. 30 accounts appear across uneven 4–7 users per game including creator; 280 plays, 46 unique ratings and 46 distinct comments. New users regular role only, randomized unknown strong password hashes (no public shared password).

- [x] Two independent game batches: five mechanics each; no runtime changes.
- [x] Root dataset: users, assignments, ratings/comments/activity, exports and invariants.
- [x] Additive transactional seed uses existing compiler/artifact storage, advisory lock, refuse collisions, idempotent complete rerun, no overwriting real rows or published artifacts.
- [x] Test disposable PG + repeat/concurrent seed + real public API/analytics + actual browser all10 mobile/desktop, independent code review.
- [ ] Backup live; apply via current API container using reviewed seed files (no application image change needed); read-only live verification; report/export, commit and cleanup.

Recovery: DB transaction rollback on insert failure; new immutable artifacts may be reused only when bytes match on retry. Existing namespace rows cause no-op only if the complete expected seed footprint exists; partial or unrelated collisions abort. Preserve later real interactions on rerun. No destructive cleanup of real records.
