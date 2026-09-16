# Repository map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js pages, Studio UI, browser interactions, and Playwright tests |
| `apps/api` | NestJS API, authorization, game services, storage, and API tests |
| `packages/contracts` | Framework-independent Zod request/response contracts |
| `packages/database` | Prisma schema, client boundary, migrations, and database tests |
| `packages/engine-core` | Browser-safe schemas, validation, adapters, reducers, and render models |
| `scripts` | Deployment, smoke, backup/restore, and real-stack E2E harnesses |
| `deploy` | Caddy production routing configuration |
| `docs` | Project Knowledge Base and historical engineering records |

## Dependency direction

`web` consumes contracts and engine-core. `api` consumes contracts, database, and engine-core. Contracts re-export selected engine types. Engine-core must not import server frameworks, Prisma, filesystem APIs, or UI components.

Generated and local build directories such as `.next`, `dist`, `node_modules`, test reports, Prisma generated clients, and local storage are not architecture sources.
