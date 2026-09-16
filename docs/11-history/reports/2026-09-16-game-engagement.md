# Game engagement and creator analytics — 2026-09-16

Status: local verification complete; production build/deployment pending.

## Scope

Real explicit-launch plays, foreground/focused bounded playtime, estimated unique accounts/browsers, ratings1–5 (one peruser with replace/delete), plain-text comments with pagination and author/moderator deletion, opt-in game-reported high score, owner/admin analytics with30-day UTC chart, creator scoreintegration controls, and separate moderator comments. Public and Studio layouts work on phone and desktop in both themes. Existing moderation approve/reject and publication invariants remain intact.

No fabricated activity/revenue or retroactive totals. Favorites, ranked leaderboard, payment, screenshot-upload subsystem and category taxonomy are not part of this basic release. Client/game scores are not anti-cheat verified; playtime is an estimate and may undercount offline/shutdown intervals. Preview launches are excluded.

## Verification

- Contracts focused regression passed; API64focused/regression tests passed, plus6controller tests after HTTPcookie fix. API types/lint passed.
- Web38focused tests and68forms/studio/admin regressions passed; web types/lint passed. Root launch/clock/frame-source/HTTPUUID tests9passed; scoped lint passed.
- Additive migration20260916150000 applied to fresh disposablePostgreSQL and populated older schema; sentineluser/game preserved and scoresEnabled defaultsfalse.
- RealHTTP harness `scripts/test-game-engagement-api.mjs` passed realCODEbuild/publication, empty stats, owner/admin analytics access, rating upsert/delete/distribution, comment cooldown/delete/game scopes, concurrent/idempotent play starts, server elapsed/sequence bounds, maxscore, disabled/expired/inactive/quarantined/auth-required/origin rejection, and30-day totals.
- Actual browser sandbox launches counted only after explicit play, accepted score8420 from iframe, and credited14seconds in each checked guest session. UUID fallback tested without crypto.randomUUID; HTTPguest cookie persisted. Rating/comment create/delete passed and markup remained plain text. OTHER/MODERATOR denied creatoranalytics; moderatorcomment view excludedearnings.
- Browser detail/analytics:390/1440dark/light passed. After screenshot inspection, scopedCSS fixed inherited negativehint margins and five-star button wrapping; read-only visual rerun320/390/1440dark/light passed nohorizontaloverflow, single starrow, nonoverlapping paragraphs,30rows charttable. Final screenshots inspected.
- Independent review identified HTTP-only compatibility issues in UUID and guestcookie security plus missing publicstats refreshevent; all fixed with regressions and re-reviewed. No outstanding blockers.
- Initial browser harness initScript attempted localStorage inside sandboxframe; restricted it to topwindow, then reran successfully. Product sandbox was preserved.

Evidence is ephemeral at `/tmp/tfg-game-engagement/`; all mutation tests used disposable database/artifact storage. Production smoke must remain read-only and must not launch games or create fake activity.

## Deployment

Pending API/web production build, consistent backup, additive migration, deployment and live verification.
