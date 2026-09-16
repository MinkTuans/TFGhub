# Admin list height — 2026-09-16

Status: local verification complete; deployment pending.

User screenshot shows a long user list extending beyond the edit form. Shared users/games CSS now lets the editor determine desktop row height while only list items scroll; pagination/reload remain outside the scrolling area. Without an editor, list height is bounded at32rem. On phone the stacked list is capped at min(26rem,60dvh). No CRUD/auth/data behavior changes.

Validation:6existing admin-management tests passed; targeted lint and diff check clean. Read-only browser against production records passed users/games at390/1440dark/light: equal desktop panel heights within2px, independent list scrolling, bounded mobile list, pagination/reload accessible, no horizontal overflow or page errors. Screenshot inspected. No real records modified.

Evidence/scripts: /tmp/tfg-admin-list-height. Pending web-only build, consistent backup and deployment; API must remain unchanged.
