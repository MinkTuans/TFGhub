# Architectural decisions

These current decisions are derived from source and migrations. Historical rationale is archived under [designs](../11-history/designs/).

1. **Shared validation:** Web and API use Zod contracts; engine rules live in browser-safe engine-core.
2. **Cookie sessions:** The API issues a short-lived HTTP-only JWT cookie rather than exposing browser bearer tokens.
3. **Immutable publication:** Public play resolves immutable content, never a mutable authoring head.
4. **Canonical ENGINE revisions:** Mutation bases use optimistic concurrency and idempotency receipts.
5. **Additive migrations:** Never edit a migration that may already have run.
6. **Storage abstractions:** Covers, artifacts, and project assets are not exposed through hardcoded filesystem URLs.
7. **Sandboxed creator content:** Creator scripts never run during API validation or moderation.
8. **Legacy compatibility:** ENGINE does not implicitly replace existing source types.
9. **Single-host baseline:** Compose runs PostgreSQL, migration job, API, web, and Caddy with persistent volumes.
