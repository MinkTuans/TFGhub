# Persistent personal game records — 2026-09-16

Status: COMPLETE — deployed to http://161.248.81.59 on 2026-09-16 at approximately 15:49 UTC.

## Change

The requested Snake game stored its record in iframe localStorage, which is blocked by the sandbox. The platform now restores the personal maximum scoped to game and account/browser from existing GamePlay/GameScore rows. The token-free score-state handshake preserves sandbox isolation; saves happen immediately with coalescing, retry and exit keepalive. Current runs still start at zero. No database migration or fabricated historical scores.

The narrowly matched Snake patch replaces localStorage, receives the personal record and reports score improvements. Deployment compared the entire captured game row and published immutable artifact #4 through the normal save/build/submit/approve lifecycle while the public API was stopped. Only the requested Snake game was changed; score collection is enabled.

## Verification

- 26 engagement API/controller tests and 37 web player/helper tests passed; API/contracts/web TypeScript and scoped lint passed.
- Disposable PostgreSQL full migration chain, real HTTP lifecycle and persistence suite passed: account/guest/game separation, cross-play restore, concurrent maximum, distinct global/personal record, zero/null and authorization guards.
- Real Chrome with actual patched Snake in unchanged opaque sandbox: gameplay score saved, reload restored guest record on 390px; account record restored on 1440px and another 390px browser context; fresh guest remained independent. New-run score stays zero.
- Independent implementation review found no correctness blockers. Deployment review requires isolated publication and rollback on external health failure; incorporated before rollout.
- A stale generated Next dev validator initially blocked full tsc; stopped own preview and regenerated that file, then full tsc passed. No source workaround.

## Limitations

Games must integrate the score bridge and enable scoring; this rollout updates the specific requested Snake. Guest identity depends on its browser cookie; guest records do not automatically merge into an account. Offline/unacknowledged writes may be lost. Scores are game-reported, not anti-cheat verified. This saves records, not the current board/run.

## Production result

- Code commit: `cdb18cd`.
- API image: `sha256:421efea2a785de16e2add441a0c2327d3836ec58e21b96d7cf6b361d1a24ed32`.
- Web image: `sha256:d6b30f34dceeefe78446dd0999548a117b622b2068b520b294ea5d7bc8c56f4a`.
- Consistent database/artifact backup: `backups/20260916T154819-910407` with verified SHA-256 manifest.
- Previous images retained as `indieforge-api:rollback-before-score-persistence-20260916` and `indieforge-web:rollback-before-score-persistence-20260916`.
- Snake `cmtrihgrg0008ns01slxim1rk` / `ran-san-moi-neon`: artifact 3 → 4, public approved/ready, scoring enabled. Historical artifact 3 retained. Original source/publication and final snapshot retained in protected task directory for conditional recovery; full backup also retained.
- Isolated publication container completed and removed; main API/web healthy, external health returned 200.
- GET-only live Chrome smoke passed at 390px and 1440px: correct artifact version, enabled scoring, new game and parent message bridge, no horizontal overflow or page errors. Did not create production plays/scores/comments or alter other games/users for testing.
- Production Docker API/web builds and TypeScript passed. Temporary preview servers and disposable PostgreSQL stopped; test session credential file removed.
