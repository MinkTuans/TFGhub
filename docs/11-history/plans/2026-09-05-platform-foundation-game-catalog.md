# Platform Foundation and Game Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable IndieForge monorepo where users can register, sign in, create a developer profile, create game drafts, and browse public game metadata.

**Architecture:** Use a pnpm monorepo containing a Next.js web application, a NestJS API, a shared Zod contract package, and a Prisma PostgreSQL package. Authentication uses short-lived JWT access tokens in secure HTTP-only cookies; game authorization remains in the API service, and the web app consumes only shared HTTP contracts.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Next.js App Router, NestJS, Prisma, PostgreSQL, Zod, Vitest, Supertest, Testing Library, Playwright, Docker Compose

**Spec:** `docs/superpowers/specs/2026-09-05-indieforge-platform-design.md`

## Global Constraints

- Start as a modular monolith in one monorepo with explicit module boundaries.
- Phase 1 supports accounts, developer profiles, game metadata, and discovery before build upload.
- Public game data must never expose private account fields.
- Authorization is enforced by the API, not only by hidden UI controls.
- No multiplayer, 3D creation, mobile packages, or asset marketplace work belongs in this plan.
- Use TDD for domain behavior and API endpoints; run the smallest relevant test after each change.

## Planned file structure

```text
apps/
  api/
    src/app.module.ts
    src/main.ts
    src/health/
    src/auth/
    src/developers/
    src/games/
    test/
  web/
    app/
    components/
    lib/api-client.ts
    tests/
    e2e/
packages/
  contracts/src/
  database/prisma/schema.prisma
  database/src/client.ts
docker-compose.yml
package.json
pnpm-workspace.yaml
turbo.json
```

`apps/api` owns business rules and authorization. `apps/web` owns presentation and browserd navigation. `packages/contracts` contains transport schemas only; it must not import framework or database code. `packages/database` owns the generated Prisma client and schema.

---

### Task 1: Runnable monorepo and health checks

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `apps/api/**`
- Create: `apps/web/**`
- Create: `packages/contracts/package.json`
- Create: `packages/database/package.json`

**Interfaces:**
- Produces: `GET /health -> { status: "ok" }`
- Produces: root commands `pnpm dev`, `pnpm test`, `pnpm lint`, and `pnpm typecheck`

- [ ] **Step 1: Scaffold the workspaces**

Run:

```bash
corepack enable
pnpm dlx @nestjs/cli new apps/api --package-manager pnpm --skip-git --strict
pnpm create next-app apps/web --ts --eslint --tailwind --app --src-dir=false --use-pnpm --import-alias='@/*'
mkdir -p packages/contracts/src packages/database/src packages/database/prisma
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Set the root `package.json` scripts:

```json
{
  "name": "indieforge",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

- [ ] **Step 2: Write the failing API health test**

Create `apps/api/test/health.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  it('reports readiness', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    await app.close();
  });
});
```

- [ ] **Step 3: Run the health test and verify RED**

Run: `pnpm --filter api test:e2e -- health.e2e-spec.ts`

Expected: FAIL because `GET /health` returns 404.

- [ ] **Step 4: Implement the minimal health module**

Create `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

Register `HealthController` in `AppModule` and configure `apps/api/src/main.ts` to listen on `API_PORT` with CORS restricted to `WEB_ORIGIN`.

- [ ] **Step 5: Verify the workspace**

Run:

```bash
pnpm install
pnpm --filter api test:e2e -- health.e2e-spec.ts
pnpm lint
pnpm typecheck
```

Expected: health test PASS; lint and typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .gitignore .env.example docker-compose.yml apps packages
git commit -m "chore: scaffold IndieForge monorepo"
```

### Task 2: Shared contracts and PostgreSQL domain schema

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/developers.ts`
- Create: `packages/contracts/src/games.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/contracts.test.ts`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/prisma/schema.test.ts`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `RegisterInput`, `LoginInput`, `DeveloperProfileInput`, `CreateGameInput`, `UpdateGameInput`, and `GameSummary`
- Produces: Prisma models `User`, `DeveloperProfile`, and `Game`
- Produces: `database: PrismaClient`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/src/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CreateGameInput, RegisterInput } from './index';

describe('contracts', () => {
  it('normalizes registration email', () => {
    expect(RegisterInput.parse({ email: ' DEV@EXAMPLE.COM ', password: 'password123' }).email)
      .toBe('dev@example.com');
  });

  it('rejects an invalid game slug', () => {
    expect(() => CreateGameInput.parse({ title: 'Demo', slug: 'Not Valid' })).toThrow();
  });
});
```

- [ ] **Step 2: Run contract tests and verify RED**

Run: `pnpm --filter @indieforge/contracts test`

Expected: FAIL because the schemas are not exported.

- [ ] **Step 3: Implement transport schemas**

Use Zod schemas with these exact fields:

```ts
export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(128),
});

export const LoginInput = RegisterInput;

export const DeveloperProfileInput = z.object({
  displayName: z.string().trim().min(2).max(50),
  bio: z.string().trim().max(500).default(''),
});

export const CreateGameInput = z.object({
  title: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).default(''),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']).default('GUEST_ALLOWED'),
});

export const UpdateGameInput = CreateGameInput.pick({
  title: true,
  description: true,
  accessMode: true,
}).partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const GameSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(['DRAFT', 'PUBLIC', 'UNLISTED']),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']),
  moderationState: z.enum(['CLEAR', 'FLAGGED', 'QUARANTINED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInput>;
export type GameSummary = z.infer<typeof GameSummary>;
```

- [ ] **Step 4: Define the database schema**

Create enums `UserRole(USER, MODERATOR, ADMIN)`, `GameVisibility(DRAFT, PUBLIC, UNLISTED)`, `GameAccessMode(GUEST_ALLOWED, AUTH_REQUIRED)`, and `ModerationState(CLEAR, FLAGGED, QUARANTINED)`.

Define:

```prisma
model User {
  id           String            @id @default(cuid())
  email        String            @unique
  passwordHash String
  role         UserRole          @default(USER)
  createdAt    DateTime          @default(now())
  profile      DeveloperProfile?
  games        Game[]
}

model DeveloperProfile {
  userId      String   @id
  displayName String
  bio         String   @default("")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Game {
  id              String          @id @default(cuid())
  ownerId         String
  slug            String          @unique
  title           String
  description     String          @default("")
  visibility      GameVisibility  @default(DRAFT)
  accessMode      GameAccessMode  @default(GUEST_ALLOWED)
  moderationState ModerationState @default(CLEAR)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  owner           User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 5: Verify contracts and migration**

Run:

```bash
docker compose up -d postgres
pnpm --filter @indieforge/database prisma migrate dev --name initial_domain
pnpm --filter @indieforge/contracts test
pnpm typecheck
```

Expected: migration succeeds; contract tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add packages docker-compose.yml
git commit -m "feat: define platform domain contracts"
```

### Task 3: Registration and cookie authentication

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `RegisterInput`, `LoginInput`, and `database`
- Produces: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Produces: `AuthenticatedUser = { id: string; email: string; role: UserRole }`

- [ ] **Step 1: Write failing registration service tests**

Test that registration normalizes email, hashes rather than stores the password, and maps Prisma unique-email failures to `ConflictException`. Inject a repository-shaped dependency so the unit test does not require PostgreSQL.

```ts
expect(hasher.hash).toHaveBeenCalledWith('password123');
expect(users.create).toHaveBeenCalledWith({
  email: 'dev@example.com',
  passwordHash: 'hashed',
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `pnpm --filter api test -- auth.service.spec.ts`

Expected: FAIL because `AuthService` does not exist.

- [ ] **Step 3: Implement registration and login minimally**

Use `argon2id` for passwords and `@nestjs/jwt` for access tokens. Token payload is exactly `{ sub: user.id, role: user.role }` and expires in 15 minutes. Never serialize `passwordHash`.

- [ ] **Step 4: Write failing auth endpoint tests**

Cover:

```ts
await request(server)
  .post('/auth/register')
  .send({ email: 'dev@example.com', password: 'password123' })
  .expect(201)
  .expect('set-cookie', /indieforge_access=/);

await request(server).get('/auth/me').expect(401);
```

- [ ] **Step 5: Implement cookie and guard behavior**

Set `indieforge_access` with `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'`, `path: '/'`, and a 15-minute max age. Logout clears the same cookie. The guard reads only this cookie and attaches `AuthenticatedUser` to the request.

- [ ] **Step 6: Verify authentication**

Run:

```bash
pnpm --filter api test -- auth.service.spec.ts
pnpm --filter api test:e2e -- auth.e2e-spec.ts
pnpm lint
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api packages
git commit -m "feat: add account authentication"
```

### Task 4: Developer profile and authorized game drafts

**Files:**
- Create: `apps/api/src/developers/developers.controller.ts`
- Create: `apps/api/src/developers/developers.service.ts`
- Create: `apps/api/src/developers/developers.module.ts`
- Create: `apps/api/src/games/games.controller.ts`
- Create: `apps/api/src/games/games.service.ts`
- Create: `apps/api/src/games/games.module.ts`
- Create: `apps/api/src/games/games.service.spec.ts`
- Create: `apps/api/test/games.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: authenticated `user.id`, `DeveloperProfileInput`, and `CreateGameInput`
- Produces: `PUT /developers/me`, `GET /developers/me`
- Produces: `POST /games`, `GET /games/mine`, `PATCH /games/:id`
- Produces: `GamesService.updateOwned(gameId: string, userId: string, input: UpdateGameInput): Promise<GameSummary>`

- [ ] **Step 1: Write failing ownership tests**

```ts
it('does not update another developer game', async () => {
  games.findUnique.mockResolvedValue({ id: 'game-1', ownerId: 'owner-1' });
  await expect(service.updateOwned('game-1', 'owner-2', { title: 'Changed' }))
    .rejects.toThrow(ForbiddenException);
  expect(games.update).not.toHaveBeenCalled();
});
```

Also test that newly created games always start as `DRAFT` and `CLEAR`, regardless of extra client fields.

- [ ] **Step 2: Run ownership tests and verify RED**

Run: `pnpm --filter api test -- games.service.spec.ts`

Expected: FAIL because `GamesService` does not exist.

- [ ] **Step 3: Implement profile and game services**

Use explicit Prisma `select` objects for every response. A public or dashboard response must include only `id`, `slug`, `title`, `description`, `visibility`, `accessMode`, `moderationState`, `createdAt`, and `updatedAt`. Profile responses include `displayName` and `bio`, never the user's email.

- [ ] **Step 4: Write and run endpoint tests**

Verify unauthenticated create returns 401, duplicate slug returns 409, owner update returns 200, and non-owner update returns 403.

Run: `pnpm --filter api test:e2e -- games.e2e-spec.ts`

Expected before controller implementation: FAIL with 404.

- [ ] **Step 5: Implement controllers and verify GREEN**

Controllers parse bodies through shared Zod schemas, use `JwtAuthGuard`, and pass `currentUser.id` into services. Do not accept `ownerId`, `visibility`, or `moderationState` from create requests.

Run:

```bash
pnpm --filter api test -- games.service.spec.ts
pnpm --filter api test:e2e -- games.e2e-spec.ts
pnpm lint
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/contracts
git commit -m "feat: add developer game drafts"
```

### Task 5: Public catalog and discovery API

**Files:**
- Create: `apps/api/src/games/public-games.controller.ts`
- Create: `apps/api/src/games/public-games.service.ts`
- Create: `apps/api/src/games/public-games.service.spec.ts`
- Create: `apps/api/test/discovery.e2e-spec.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `packages/contracts/src/games.ts`

**Interfaces:**
- Produces: `GET /discover?query=&cursor=&limit=`
- Produces: `GET /games/by-slug/:slug`
- Produces: `PublicGameSummary = { slug; title; description; developer: { displayName }; createdAt }`

- [ ] **Step 1: Write failing visibility tests**

Test that discovery requires both `visibility: PUBLIC` and `moderationState: CLEAR`, caps `limit` at 50, and never returns owner email.

```ts
expect(games.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { visibility: 'PUBLIC', moderationState: 'CLEAR' },
  take: 21,
}));
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter api test -- public-games.service.spec.ts`

Expected: FAIL because `PublicGamesService` does not exist.

- [ ] **Step 3: Implement cursor pagination and safe projections**

Default `limit` is 20. Fetch `limit + 1`, return at most `limit` items, and derive `nextCursor` from the extra row. Search title and description case-insensitively. Sort by `createdAt desc, id desc` for deterministic pagination.

- [ ] **Step 4: Add endpoint tests and implementation**

Test an empty catalog, search, cursor continuation, 404 for drafts, and a public game response. Implement thin public controllers that call only `PublicGamesService`.

- [ ] **Step 5: Verify discovery**

Run:

```bash
pnpm --filter api test -- public-games.service.spec.ts
pnpm --filter api test:e2e -- discovery.e2e-spec.ts
pnpm lint
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/contracts
git commit -m "feat: expose public game catalog"
```

### Task 6: Web registration, studio, and discovery flows

**Files:**
- Create: `apps/web/lib/api-client.ts`
- Create: `apps/web/app/register/page.tsx`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/studio/page.tsx`
- Create: `apps/web/app/studio/games/new/page.tsx`
- Create: `apps/web/app/discover/page.tsx`
- Create: `apps/web/app/games/[slug]/page.tsx`
- Create: `apps/web/components/game-card.tsx`
- Create: `apps/web/tests/game-card.test.tsx`
- Create: `apps/web/e2e/account-game-flow.spec.ts`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: authentication, profile, private-game, and discovery endpoints from Tasks 3-5
- Produces: registration/login forms, developer dashboard, draft creation form, discovery list, and public metadata page

- [ ] **Step 1: Write a failing component test**

```tsx
render(<GameCard game={{ slug: 'tiny-quest', title: 'Tiny Quest', description: 'A demo', developer: { displayName: 'Minh' } }} />);
expect(screen.getByRole('link', { name: /tiny quest/i })).toHaveAttribute('href', '/games/tiny-quest');
expect(screen.getByText(/minh/i)).toBeVisible();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter web test -- game-card.test.tsx`

Expected: FAIL because `GameCard` does not exist.

- [ ] **Step 3: Implement the API client and UI pages**

`api-client.ts` exposes typed `get`, `post`, `put`, and `patch` helpers, always passes `credentials: 'include'`, parses JSON errors into `{ status, message }`, and does not hide non-2xx responses. Server-render public pages; use client components only for forms.

- [ ] **Step 4: Verify component behavior**

Run: `pnpm --filter web test -- game-card.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write the failing Playwright journey**

Create a unique user, register, create a profile, create a draft, confirm it appears in Studio, and confirm it does not appear in Discover while still a draft.

```ts
await page.goto('/register');
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill('password123');
await page.getByRole('button', { name: 'Create account' }).click();
await expect(page).toHaveURL('/studio');
```

- [ ] **Step 6: Run E2E and implement missing wiring until GREEN**

Run: `pnpm --filter web e2e -- account-game-flow.spec.ts`

Expected: PASS with API, web, and PostgreSQL test services running.

- [ ] **Step 7: Run the full foundation verification**

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter api build
```

Expected: all tests pass and both production builds exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: add game catalog web flows"
```

### Task 7: Developer setup and acceptance documentation

**Files:**
- Create: `README.md`
- Create: `docs/development.md`
- Create: `docs/api/foundation.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: all commands and endpoints delivered in Tasks 1-6
- Produces: exact local setup, verification, and API usage instructions

- [ ] **Step 1: Write setup documentation**

Document prerequisites, environment keys, `docker compose up -d postgres`, `pnpm install`, migration commands, `pnpm dev`, test commands, application URLs, cookie behavior, and how to stop local services. State that build upload, scanning, game runtime, analytics, donations, and publishing are planned but not delivered by this slice.

- [ ] **Step 2: Write API examples**

Include request/response examples for register, login, current user, developer profile, create draft, list owned games, discover, and public game lookup. Use fake addresses and no real credentials.

- [ ] **Step 3: Validate documented commands from a clean database**

Run:

```bash
docker compose down -v
docker compose up -d postgres
pnpm --filter @indieforge/database prisma migrate deploy
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter api build
```

Expected: migration deploys from zero; every test and check exits 0.

- [ ] **Step 4: Commit**

```bash
git add README.md docs .env.example
git commit -m "docs: add foundation development guide"
```

## Follow-up plans

After this plan is complete, create separate reviewed plans in this order:

1. Build upload, quarantine storage, validation, scanning, immutable deployment, release state machine, and rollback.
2. Sandboxed runtime domain, origin-checked bridge protocol, play sessions, heartbeat ingestion, and analytics aggregation.
3. Donations, reports, quarantine moderation, and audit records.
4. Discovery ranking experiments and monthly advertising revenue statements.
5. Phaser runtime, project format, code editor, visual editor, and no-code event system as independently deliverable slices.
