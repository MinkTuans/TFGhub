# Persistent personal game records — 2026-09-16

Status: validated locally; production rollout pending.

## Change

The requested Snake game stored its record in iframe localStorage, which is blocked by the sandbox. The platform now restores the personal maximum scoped to game and account/browser from existing GamePlay/GameScore rows. The token-free score-state handshake preserves sandbox isolation; saves happen immediately with coalescing, retry and exit keepalive. Current runs still start at zero. No database migration or fabricated historical scores.

The narrowly matched Snake patch replaces localStorage, receives the personal record and reports score improvements. Deployment will compare the captured original source and publish a new immutable artifact through the normal lifecycle, while the public API is stopped to prevent simultaneous edits.

## Verification

- 26 engagement API/controller tests and 37 web player/helper tests passed; API/contracts/web TypeScript and scoped lint passed.
- Disposable PostgreSQL full migration chain, real HTTP lifecycle and persistence suite passed: account/guest/game separation, cross-play restore, concurrent maximum, distinct global/personal record, zero/null and authorization guards.
- Real Chrome with actual patched Snake in unchanged opaque sandbox: gameplay score saved, reload restored guest record on 390px; account record restored on 1440px and another 390px browser context; fresh guest remained independent. New-run score stays zero.
- Independent implementation review found no correctness blockers. Deployment review requires isolated publication and rollback on external health failure; incorporated before rollout.
- A stale generated Next dev validator initially blocked full tsc; stopped own preview and regenerated that file, then full tsc passed. No source workaround.

## Limitations

Games must integrate the score bridge and enable scoring; this rollout updates the specific requested Snake. Guest identity depends on its browser cookie; guest records do not automatically merge into an account. Offline/unacknowledged writes may be lost. Scores are game-reported, not anti-cheat verified. This saves records, not the current board/run.
