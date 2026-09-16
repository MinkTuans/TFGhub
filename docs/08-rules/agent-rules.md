# Agent rules

1. Read [the documentation hub](../README.md), context, relevant architecture, feature/workflow, API/database, and these rules before changing code.
2. Treat current source, contracts, migrations, and tests as authoritative. Do not guess behavior.
3. Historical plans and reports are not current executable instructions.
4. Preserve package boundaries. Engine-core remains browser-safe; API owns authorization and business rules; web owns presentation and editor interaction.
5. Do not rewrite the project, change architecture, invent endpoints, or invent database fields without an explicit requirement and verified need.
6. Inspect direct and workspace dependencies before adding or relying on a package. Do not rely on an incidental transitive dependency.
7. Keep schema changes additive. Add a migration; never modify an applied migration.
8. Preserve compatibility for `UPLOAD`, `CODE`, `STORY`, and `PLATFORMER` unless a migration requirement explicitly says otherwise.
9. Enforce authorization server-side. UI state is not an authorization boundary.
10. Preserve canonical revision, stable-ID, idempotency, and immutable-publication invariants.
11. Never commit or print credentials, tokens, `.env` files, dumps, backups, or protected host configuration.
12. Production mutation, restore, role elevation, or destructive commands require explicit current authorization and target verification.
13. Avoid unrelated refactors and never overwrite another task's uncommitted changes.
14. Update docs when behavior, API, database, configuration, workflow, or architecture changes.
15. Run focused tests first and the relevant broader gates. Do not claim completion or deployment without fresh evidence.

For `apps/web`, also obey `apps/web/AGENTS.md` and installed Next.js documentation.
