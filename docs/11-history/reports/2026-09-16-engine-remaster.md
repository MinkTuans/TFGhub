# Pixel Studio remaster — IN PROGRESS

User authorized autonomous design, implementation, a real editable pixel sample and detailed documentation, including deployment. Worktree: `deploy-ip-preview`.

Implemented: canonical script/settings/project replacement with exact history; owned V2 builds with copied assets and atomic head/provenance finalization; generic top-down runtime with isolated script workers; editable Đảo Đom Đóm template; shared public/editor guide at `/huong-dan`; beginner task workspace with visible imports, code and actual preview/publish controls (UI final browser validation ongoing).

Verification completed so far:
- 196 mutation tests.
- 17 runtime/compiler/template tests; real sandbox Chrome keyboard/touch/restart, script syntax/watchdog and pause probes.
- 11 PostgreSQL revision tests, including invalidation and idempotent replay.
- 3 PostgreSQL lifecycle tests: asset/code/build/publish, same-timestamp head race, provenance transaction rollback.
- API typecheck and initial build passed. 66/67 focused API tests passed under contention; the one compressed ZIP timeout passed in isolated rerun (36/36 content service tests).
- UI desktop/mobile browser tests and focused tests continue in worker.

Release ledger:
- Candidate API image building using `/tmp/tfg-engine-remaster/Dockerfile.api`, tag `indieforge-api:engine-remaster-20260916` (not deployed).
- Web candidate build pending final UI commit.
- Backup script running; see `/tmp/tfg-engine-remaster/backup.log`.
- No production sample or guide writes yet. Authorized scoped publisher prepared `/tmp/tfg-engine-remaster/publish-sample.mjs`; requires cover, guide and script copied to API container after deployment.
- Isolated local web3125/API3126/Postgres55449; browser data separate from production.
- Final tasks: tests/review resolution, web/API image verification, backup completion, deploy, create sample + guide via APIs, live checks, mark COMPLETE.

## Resumed 2026-09-17
Previous run was interrupted; API was stopped after backup. Restored original API container, confirmed web/API HTTP200 and healthy. No production upgrade or sample writes had happened.
- UI completed and committed ce7d18c; real browser creation/code/save-reload/build/mobile PASS.
- Real PNG placement probe revealed hidden canvas bounds; fixed by showing design before animation-frame placement, and frontmost layer choice. PNG/JS/JSON roundtrip/rebuild PASS.
- New backup verified `backups/20260917T025126-1315463.sha256`; both old production services restarted successfully.
- API candidate build PASS image958adf02c41d. Web candidate building; requires final two-file overlay for placement fix.
- Initial web tests138/147 PASS, remaining timeout under build contention; isolated slower-timeout rerun underway. Source no assertion waiver.

## Expanded product pass 2026-09-17
The user expanded acceptance to a complete small Pixel Game Maker: visual gameplay, object recipes, five templates, searchable in-engine documentation, broader runtime support and full create-to-export verification. The approved design and execution plan are in `docs/superpowers/specs/2026-09-17-complete-pixel-game-maker-design.md` and `docs/superpowers/plans/2026-09-17-complete-pixel-game-maker.md`.

Completed in this pass:
- Canonical `event.upsert`, `event.delete` and `project.variables` mutations with exact undo/order and schema validation (`bf409d8`); engine-core typecheck and 198 mutation tests passed.
- A dedicated Gameplay step with no-code When/Then rules, event enable/delete, global variables and canonical undo/save (`f23c000`); focused web typecheck and interaction tests passed.
- Searchable in-engine documentation with categorized sidebar, 37 required topics, previous/next navigation, runtime-accurate limitations and the existing detailed playable tutorial (`ef69fda`); focused UI test passed.
- One-click enemy and tilemap recipes alongside Player, Item, NPC and Decoration. Enemy creation atomically includes sprite, collider and health and is undoable (`3eb2b13`); focused preset tests passed.

Still required before release: broaden visual rules to object collisions/collectibles/health, implement runtime animation/audio/AI/camera gaps selected for the small-engine scope, finish five honest templates, pixel asset setup, run the complete regression/browser flow, build/deploy images and perform live verification. Production remains on the pre-remaster images.
