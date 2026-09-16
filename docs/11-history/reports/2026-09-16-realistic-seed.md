# Vietnamese community seed — 2026-09-16

Status: validated; live application pending.

Dataset: 30 synthetic Vietnamese accounts, 10 different playable CODE games, 56 memberships (4–7 per game including creator), 280 detailed plays and scores, 46 distinct user/game ratings, 46 individually written comments. Natural names, varied registration/game/activity dates, no overlapping historical sessions per user, mixed 2–5-star ratings and uneven engagement. All accounts have at least one game; one participant plays five games. Every aggregate derives from detail rows.

[Overview](../datasets/2026-09-16-community/overview.md) · [Full dataset](../datasets/2026-09-16-community/data.json) · [Seed instructions](../../../scripts/seed-community/README.md).

Schema and application logic are unchanged. Existing User/DeveloperProfile/Game/GamePlay/GameScore/GameRating/GameComment/GameCommentCooldown store the data. Genre is descriptive text; username is export metadata only. No avatar/payment/revenue columns are invented. GameRating has no timestamp; no fake persisted rating date is claimed. Profiles/descriptions identify demo origin. Reserved emails and independent random unknown Argon2id passwords avoid shared sample credentials.

Validation:
- Dataset invariants: counts, membership coverage, rating uniqueness, source/FK consistency, chronological comments/plays, deterministic output.
- Disposable PostgreSQL: full existing migration chain, fresh/repeat/concurrent seed, injected insertion failure and artifact reuse, partial identity/relation collision and missing artifact rejection, existing sentinel account and later profile edit preservation. Final game code fixture tested after compact mobile adjustment.
- Actual sandboxed Chrome: all 10 games win/loss/restart/score/personal-record/message-validation scenarios on small and desktop viewports. Reaction board compacted so all nine targets fit while playing on 300×375. Mastermind duplicate feedback and actual pipe path tested.
- Real API: all ten public stats, author identities/comments and private creator analytics match exported aggregates; anonymous analytics rejected; a seeded participant restores its correct personal maximum through actual authenticated launch.
- Full website browser: all ten games load and launch at 390px/1440px, comments visible, iframe sandbox preserved, no horizontal overflow or page errors (20 combinations).
- Independent review found a rerun completeness gap; fixed by validating immutable FK identities, cooldown footprint and original artifact bytes. Final review has no remaining blockers.

No application rebuild is required: reviewed seed files use the current compiled API/database modules. Live target and artifact root are checked independently, and database/artifact backups precede insertion. Existing rows are never updated or deleted; complete reruns are read-only.
