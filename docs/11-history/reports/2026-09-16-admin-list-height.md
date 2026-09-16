# Admin list height — 2026-09-16

Status: completed and verified live on 2026-09-16. Code commit `9ff0944`.

User screenshot shows a long user list extending beyond the edit form. Shared users/games CSS now lets the editor determine desktop row height while only list items scroll; pagination/reload remain outside the scrolling area. Without an editor, list height is bounded at32rem. On phone the stacked list is capped at min(26rem,60dvh). No CRUD/auth/data behavior changes.

Validation:6existing admin-management tests passed; targeted lint and diff check clean. Read-only browser against production records passed users/games at390/1440dark/light: equal desktop panel heights within2px, independent list scrolling, bounded mobile list, pagination/reload accessible, no horizontal overflow or page errors. Screenshot inspected. No real records modified.

Evidence/scripts: /tmp/tfg-admin-list-height. Web-only production build/TypeScript passed (exit0). Validated backup prefix `backups/20260916T152705-888304` includes database/artifacts/checksums. Deployed web image `sha256:616ab8d4d81205bba5796a04baeef51c4c69d6e7b0e9dd96a7384bf78a0bc1db`; API image unchanged at `sha256:8a315d81964f23fe2289a903d9052144ef7ea76660ae27e4f1ae37cd1bf32564`. Services healthy. Rollback web tag `indieforge-web:rollback-before-admin-list-height-20260916` retained.

Live read-only browser passed all four390/1440dark/light cases for users and games: desktop list matches editor height, long contents independently scroll, mobile list bounded, controls accessible, no horizontal overflow/page errors. No account/game mutations. Preview stopped and temporary token removed. Task complete; scheduled wakeups must not repeat tests/build/deployment.
