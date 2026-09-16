# Game engagement and creator analytics — 2026-09-16

Status: completed and verified live at http://161.248.81.59 on 2026-09-16. Code commit `4517d08`.

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

Evidence is ephemeral at `/tmp/tfg-game-engagement/`; all mutation tests used disposable database/artifact storage. Production smoke remained read-only: no game launches or fake activity.

## Deployment

- Docker API/web production builds passed, including Next compilation and TypeScript.
- Validated consistent backup: `backups/20260916T142324-831352.database.dump`, `.artifacts.tar.gz` and `.sha256` manifest.
- Additive migration `20260916150000_game_engagement` applied successfully.
- API image `sha256:8a315d81964f23fe2289a903d9052144ef7ea76660ae27e4f1ae37cd1bf32564`.
- Web image `sha256:ae84b2f0e2317de518ea83fc6433e65a9071b5106007c9a9776e5d88fdccf09a`.
- Rollback images retained as `indieforge-api:rollback-before-engagement-20260916` and `indieforge-web:rollback-before-engagement-20260916`.
- API/web healthy; public health check OK.
- Live read-only browser passed on390/1440px in dark/light: public engagement and explicitlaunch button, no iframe autoload, guest analytics redirect, admin privateanalytics30-day table, scoped moderatorcomments without earnings, no page errors/horizontal overflow. Browser API interception asserted GET-only; no fake production plays/comments/ratings or setting changes.
- Preview processes and disposablePostgreSQL stopped. Temporary fixture sessions and short-lived live token deleted; token not printed. No prior completed admin/library/password deployment repeated.
