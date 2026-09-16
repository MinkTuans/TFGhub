# System architecture

TFGhub is a pnpm 10/Turborepo TypeScript monorepo.

```text
Browser
  └─ Caddy
      ├─ /api/* ── NestJS API ── PostgreSQL
      │                       └─ game_storage
      └─ /* ───── Next.js web
                    └─ private SSR calls to API_INTERNAL_URL
```

Production Caddy removes the `/api` prefix before proxying to Nest. Browser code uses build-time `NEXT_PUBLIC_API_URL`; server rendering prefers private `API_INTERNAL_URL`.

## Application boundaries

- **Web:** presentation, forms, Studio state, browser recovery, and editor input.
- **API:** authentication, authorization, persistence, compilation, storage validation, moderation, and capability issuance.
- **Contracts:** shared transport validation.
- **Database:** relational persistence and migration-enforced invariants.
- **Engine core:** deterministic canonical game-domain operations.

UI visibility is never an authorization boundary. PostgreSQL stores accounts and metadata; `game_storage` stores artifacts, covers, immutable project assets, and thumbnails. Backups must pair database and storage. See [database](../06-database/schema-and-migrations.md) and [deployment](../10-deployment/runbook.md).
