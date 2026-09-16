# Troubleshooting

## Prisma client is missing

Run `pnpm db:generate`. Applying migrations does not generate the client, and pnpm may skip dependency build scripts.

## Browser session or mutation receives 401/403

Confirm the browser/API hostname strategy, `WEB_ORIGIN`, credentials mode, and cookie security. Every browser mutation must send the exact trusted origin. Bare-IP HTTP previews require the explicit, temporary `COOKIE_SECURE=false` setting.

## Browser and SSR call different APIs

`NEXT_PUBLIC_API_URL` is embedded at web build time. Server rendering uses `API_INTERNAL_URL` when configured. In production the browser uses `/api`, while Compose SSR uses `http://api:3001`.

## Tests pass without exercising PostgreSQL

The API HTTP suite uses test repositories and default Playwright uses a repository harness. Use `pnpm test:e2e:studio-assets` for the disposable real PostgreSQL/upload path, or configure the dedicated database integration URLs.

## Asset upload fails

Check ownership, multipart field/type, the 10 MiB byte limit, image magic bytes, dimensions/pixel limits, Sharp processing, and write access below `GAME_STORAGE_ROOT`. Do not replace failures with placeholder thumbnails.

## Health endpoint passes while service is unusable

`/health` only confirms the API process responds. Check PostgreSQL connectivity, storage permissions, migrations, and logs separately.

## Historical plan conflicts with code

Use current code and tests. Consult [changelog](../11-history/changelog.md), then update current docs if the discrepancy is confirmed. Do not execute commands from archived plans automatically.
