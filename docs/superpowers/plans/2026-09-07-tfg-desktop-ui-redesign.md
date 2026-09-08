# TFG Desktop UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the desktop web application as TFG, add a cohesive light/dark design system, durable game-cover uploads, and a no-scroll three-column public game player with disabled-by-default AdSense slots and real fullscreen.

**Architecture:** Preserve the current Next.js/NestJS/Prisma application and publishing state machine. Extend game summaries with versioned cover metadata stored atomically in the existing persistent game volume, then compose focused web components (`ThemeToggle`, `GameCover`, `AdSlot`, and `GamePlayer`) into the current server-rendered pages. Keep executable game artifact delivery and cover delivery separate, and keep all ad code behind build-time validation and an explicit enable flag.

**Tech Stack:** TypeScript, Next.js 16.3.4, React 19.2.8, NestJS, Prisma/PostgreSQL, Vitest/Testing Library, Playwright, Docker Compose, Caddy

**Spec:** `docs/superpowers/specs/2026-09-07-tfg-desktop-ui-redesign-design.md`

## Global Constraints

- Desktop-only design and acceptance at 1280×720, 1440×900, and 1920×1080; narrow windows must not break, but no dedicated mobile UX is added.
- All user-facing application copy is Vietnamese and the displayed brand is exactly `TFG`.
- Use cyan and electric violet accents in both `light` and `dark` themes; default theme is `system` and manual choice persists when storage is available.
- Do not add a UI framework or another production dependency.
- Preserve auth, roles, moderation revisions/state transitions, game sandbox/CSP, signed capability URLs, and public artifact delivery.
- Game content keeps its aspect ratio in normal and fullscreen layouts; never stretch or crop it to fill the player.
- Cover uploads accept only JPEG, PNG, or WebP up to exactly 5 MiB and must be stored atomically in the existing game-storage volume.
- AdSense remains disabled in the deployed test environment; disabled mode makes no Google network request.
- Follow RED–GREEN–REFACTOR for every behavior change and run the named focused test before each commit.

---

### Task 1: Add cover metadata to database and shared contracts

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260907190000_game_covers/migration.sql`
- Modify: `packages/database/prisma/schema.test.ts`
- Modify: `packages/contracts/src/games.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `apps/api/src/games/games.service.spec.ts`
- Modify: `apps/api/src/games/moderation.service.spec.ts`
- Modify: `apps/api/src/games/public-games.service.ts`
- Modify: `apps/api/src/games/public-games.service.spec.ts`

**Interfaces:**
- Produces database fields `Game.coverVersion Int @default(0)`, `Game.coverContentType String?`, `Game.viewportWidth Int @default(16)`, and `Game.viewportHeight Int @default(9)`.
- Produces contract fields `coverVersion`, `coverContentType`, `viewportWidth`, and `viewportHeight` on `GameSummary` and `PublicGameSummary`; `CreateGameInput` defaults the viewport to 16×9 and `UpdateGameInput` accepts either/both dimensions.
- Produces `StoredGame.coverVersion`, `StoredGame.coverContentType`, and matching Prisma selections consumed by Tasks 3–9.

- [x] **Step 1: Write failing contract and schema assertions**

Add assertions equivalent to:

```ts
expect(GameSummary.parse({ ...game, coverVersion: 0, coverContentType: null }))
  .toMatchObject({ coverVersion: 0, coverContentType: null });
expect(PublicGameSummary.parse({
  ...publicGame,
  coverVersion: 2,
  coverContentType: 'image/webp',
})).toMatchObject({ coverVersion: 2, coverContentType: 'image/webp' });
expect(schema).toContain('coverVersion     Int             @default(0)');
expect(schema).toContain('coverContentType String?');
expect(schema).toContain('viewportWidth    Int             @default(16)');
expect(schema).toContain('viewportHeight   Int             @default(9)');
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @indieforge/contracts test && pnpm --filter @indieforge/database test`

Expected: FAIL because cover fields and the migration do not exist.

- [x] **Step 3: Add the nullable-compatible migration and contract fields**

Use this migration shape:

```sql
ALTER TABLE "Game"
  ADD COLUMN "coverVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coverContentType" TEXT,
  ADD COLUMN "viewportWidth" INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN "viewportHeight" INTEGER NOT NULL DEFAULT 9;

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_cover_metadata_check"
  CHECK (
    ("coverVersion" = 0 AND "coverContentType" IS NULL)
    OR
    ("coverVersion" > 0 AND "coverContentType" IN ('image/jpeg', 'image/png', 'image/webp'))
  );

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_viewport_check"
  CHECK (
    "viewportWidth" BETWEEN 1 AND 4096
    AND "viewportHeight" BETWEEN 1 AND 4096
  );
```

Extend Zod summaries with:

```ts
const CoverContentType = z.enum(['image/jpeg', 'image/png', 'image/webp']);
coverVersion: z.number().int().nonnegative(),
coverContentType: CoverContentType.nullable(),
viewportWidth: z.number().int().min(1).max(4096),
viewportHeight: z.number().int().min(1).max(4096),
```

Use `z.coerce.number().int().min(1).max(4096).default(...)` for the create input so native form values parse correctly, and optional equivalents in `UpdateGameInput`. Propagate all four fields through `StoredGame`, `gameSummary`, moderation summaries, `PublicGame`, `summary()`, `gameSummarySelect`, `moderationGameSelect`, and `publicGameSelect`. Update every typed test fixture with `coverVersion: 0`, `coverContentType: null`, `viewportWidth: 16`, and `viewportHeight: 9`.

- [x] **Step 4: Generate Prisma and verify GREEN**

Run: `pnpm --filter @indieforge/database prisma generate && pnpm --filter @indieforge/contracts test && pnpm --filter @indieforge/database test && pnpm --filter api test`

Expected: all contract, schema, and API unit tests PASS.

- [x] **Step 5: Commit the schema/contract slice**

```bash
git add packages/contracts packages/database apps/api/src/games
git commit -m "feat(games): add versioned cover metadata"
```

---

### Task 2: Implement isolated atomic cover storage

**Files:**
- Create: `apps/api/src/game-covers/cover-types.ts`
- Create: `apps/api/src/game-covers/cover-storage.ts`
- Create: `apps/api/src/game-covers/cover-storage.spec.ts`
- Create: `apps/api/src/game-covers/game-covers.module.ts`
- Modify: `apps/api/src/games/games.module.ts`

**Interfaces:**
- Produces `CoverContentType = 'image/jpeg' | 'image/png' | 'image/webp'` and `StoredCover { content: Buffer; contentType: CoverContentType }`.
- Produces injectable `CoverStorage` methods `install(gameId: string, version: number, cover: StoredCover): Promise<void>`, `read(gameId: string, version: number): Promise<StoredCover>`, and `discardUnreferenced(gameId: string, version: number, referencedVersion: number): Promise<void>`.
- Stores covers below `${GAME_STORAGE_ROOT}/covers/<gameId>/<version>/cover` so artifact paths `${GAME_STORAGE_ROOT}/<gameId>/<artifactVersion>/...` remain unchanged.

- [x] **Step 1: Write storage tests for atomic install, immutable versions, reads, traversal, symlinks, and cleanup**

Use a fresh `mkdtemp()` root per test and assert real filesystem behavior:

```ts
await storage.install('game-1', 1, {
  content: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  contentType: 'image/jpeg',
});
await expect(storage.read('game-1', 1)).resolves.toEqual({
  content: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  contentType: 'image/jpeg',
});
await expect(storage.install('game-1', 1, cover)).rejects.toThrow(
  CoverVersionExistsError,
);
await expect(storage.read('../escape', 1)).rejects.toThrow(/within/);
await storage.discardUnreferenced('game-1', 2, 1);
```

Also assert a failed staged write leaves version 1 readable and no `.staging-*` entry remains.

- [x] **Step 2: Run the storage test and verify RED**

Run: `pnpm --filter api test -- src/game-covers/cover-storage.spec.ts`

Expected: FAIL because the cover storage module does not exist.

- [x] **Step 3: Implement minimal atomic storage**

Follow the existing `ArtifactStorage` safety pattern: validate `gameId` with `/^[a-zA-Z0-9_-]+$/`, validate positive safe-integer versions, resolve every path inside the cover root, stage with `mkdir`/`writeFile({ flag: 'wx' })`, write a JSON metadata file containing only `contentType`, chmod files read-only, and atomically `rename` the staging directory. Reject symbolic links on reads and unseal only an explicitly validated unreferenced next version during cleanup.

- [x] **Step 4: Register the provider and verify GREEN**

Import `GameCoversModule` into `GamesModule`, export `CoverStorage`, then run:

`pnpm --filter api test -- src/game-covers/cover-storage.spec.ts src/game-artifacts/artifact-storage.spec.ts && pnpm --filter api typecheck`

Expected: cover and artifact storage tests PASS, proving namespaces do not interfere.

- [x] **Step 5: Commit atomic cover storage**

```bash
git add apps/api/src/game-covers apps/api/src/games/games.module.ts
git commit -m "feat(api): add atomic game cover storage"
```

---

### Task 3: Add secure owner upload and public/private cover delivery

**Files:**
- Create: `apps/api/src/game-covers/game-cover.service.ts`
- Create: `apps/api/src/game-covers/game-cover.service.spec.ts`
- Create: `apps/api/src/game-covers/game-cover.controller.ts`
- Modify: `apps/api/src/game-covers/game-covers.module.ts`
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/games.module.ts`
- Modify: `apps/api/test/games.e2e-spec.ts`
- Modify: `apps/web/e2e/api-harness.mjs`

**Interfaces:**
- Extends `GamesRepository` with `updateCover(id, ownerId, expectedUpdatedAt, expectedCoverVersion, { coverVersion, coverContentType }): Promise<StoredGame | null>`.
- Produces authenticated `POST /games/:id/cover` with multipart field `cover` and a 5 MiB limit.
- Produces authenticated owner `GET /games/:id/cover/:version` and public `GET /covers/:slug/:version`.
- `GameCoverService.upload()` returns the updated `GameSummary`; read methods return `StoredCover`.

- [x] **Step 1: Write failing service and E2E tests**

Cover the exact behaviors:

```ts
await request(app.getHttpServer())
  .post(`/games/${game.id}/cover`)
  .set('Cookie', ownerCookie)
  .attach('cover', validWebp, { filename: 'cover.webp', contentType: 'image/webp' })
  .expect(201)
  .expect(({ body }) => {
    expect(body.coverVersion).toBe(1);
    expect(body.coverContentType).toBe('image/webp');
  });

await request(app.getHttpServer())
  .post(`/games/${game.id}/cover`)
  .set('Cookie', otherUserCookie)
  .attach('cover', validPng, 'cover.png')
  .expect(403);

await request(app.getHttpServer())
  .post(`/games/${game.id}/cover`)
  .set('Cookie', ownerCookie)
  .attach('cover', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' })
  .expect(400);
```

Also assert: missing file 400; MIME/magic mismatch 400; 5 MiB + 1 byte 413; draft public cover 404; owner draft cover 200; approved public cover 200 with `Content-Type`, `X-Content-Type-Options: nosniff`, and immutable cache; stale version 404; DB failure after install discards only the unreferenced new version and preserves the old cover.

- [x] **Step 2: Run the focused service/E2E tests and verify RED**

Run: `pnpm --filter api test -- src/game-covers/game-cover.service.spec.ts && pnpm --filter api test:e2e -- --runInBand -t "cover"`

Expected: FAIL because routes, service, repository mutation, and test adapter support are absent.

- [x] **Step 3: Implement magic-byte validation and serialized upload**

Use exact signature checks without a new dependency:

```ts
function detectedType(bytes: Buffer): CoverContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}
```

Serialize uploads per game, check owner before writing, require detected type to equal Multer MIME type, install `coverVersion + 1`, then perform an optimistic database update on `updatedAt` and `coverVersion`. On conflict, reload reconciliation state and discard only the unreferenced next cover version. Do not reset moderation state when a cover changes.

- [x] **Step 4: Implement guarded delivery and adapter persistence**

Owner delivery requires `JwtAuthGuard` plus ownership and an exact current version. Public delivery uses the same `PUBLIC + CLEAR + APPROVED` predicate as `PublicGamesService` and an exact current version. Send bytes directly; never reuse executable artifact CSP or signed capability tokens for covers.

Implement Prisma `updateCover` with `updateMany({ where: { id, ownerId, updatedAt, coverVersion: expectedCoverVersion } })`, then select the row. Extend the browser E2E in-memory game rows/repository with cover fields and `updateCover`.

- [x] **Step 5: Verify GREEN and commit**

Run: `pnpm --filter api test && pnpm --filter api test:e2e -- --runInBand && pnpm --filter api typecheck && pnpm --filter api lint`

Expected: all API unit and E2E tests PASS.

```bash
git add apps/api/src apps/api/test apps/web/e2e/api-harness.mjs
git commit -m "feat(api): upload and serve game covers"
```

---

### Task 4: Build the TFG app shell and persistent light/dark theme

**Files:**
- Create: `apps/web/components/tfg-logo.tsx`
- Create: `apps/web/components/theme-toggle.tsx`
- Create: `apps/web/components/site-navigation.tsx`
- Create: `apps/web/tests/app-shell.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/logout-button.tsx`
- Create: `apps/web/app/icon.svg`
- Delete: `apps/web/app/favicon.ico` after `icon.svg` is present and verified by the Next.js build

**Interfaces:**
- `TfgLogo({ compact?: boolean })` renders the accessible TFG monogram.
- `ThemeToggle` exposes an accessible button and cycles `system -> light -> dark -> system`, storing key `tfg-theme` when permitted.
- `SiteNavigation({ session })` renders Vietnamese navigation and role-dependent links.
- Root HTML uses `data-theme="light" | "dark"` when manually selected; absence means system theme.

- [x] **Step 1: Write failing app-shell tests**

Assert logo/navigation Vietnamese copy, role visibility, theme cycling, storage persistence, blocked-storage fallback, and `aria-label` updates:

```tsx
render(<ThemeToggle />);
await user.click(screen.getByRole('button', { name: 'Giao diện: theo hệ thống' }));
expect(document.documentElement).toHaveAttribute('data-theme', 'light');
expect(localStorage.getItem('tfg-theme')).toBe('light');
```

Stub `localStorage.setItem` to throw and assert the theme still changes without rendering an error.

- [x] **Step 2: Run the focused web test and verify RED**

Run: `pnpm --filter web test -- tests/app-shell.test.tsx`

Expected: FAIL because the TFG shell components do not exist.

- [x] **Step 3: Implement shell components and pre-paint theme bootstrap**

Add an inline bootstrap in `<head>` that accepts only `system`, `light`, or `dark`, catches storage failures, and sets/removes `data-theme` before paint. Keep `optionalSession()` server-side. Replace IndieForge metadata with Vietnamese TFG metadata. Render `ThemeToggle` as a small client island and keep navigation usable without client JavaScript.

- [x] **Step 4: Introduce semantic tokens and global primitives**

Replace literal colors with variables including `--page`, `--surface`, `--surface-raised`, `--text`, `--muted`, `--border`, `--primary`, `--secondary`, `--success`, `--warning`, `--danger`, `--radius-sm/md/lg`, and `--shadow-*`. Define both manual `[data-theme]` and `@media (prefers-color-scheme)` values. Add shared button, form, card, badge, alert/status, skeleton, focus-visible, sticky header, container, and reduced-motion rules. Do not style page-specific three-column player layout yet.

- [x] **Step 5: Verify GREEN and commit**

Run: `pnpm --filter web test -- tests/app-shell.test.tsx && pnpm --filter web typecheck && pnpm --filter web lint`

Expected: shell tests, typecheck, and lint PASS.

```bash
git add apps/web/app/layout.tsx apps/web/app/globals.css apps/web/app/icon.svg apps/web/app/favicon.ico apps/web/components apps/web/tests/app-shell.test.tsx
git commit -m "feat(web): introduce TFG design system and themes"
```

---

### Task 5: Create reusable cover cards and redesign Home/Discover

**Files:**
- Create: `apps/web/components/game-cover.tsx`
- Create: `apps/web/components/feature-icon.tsx`
- Modify: `apps/web/components/game-card.tsx`
- Modify: `apps/web/tests/game-card.test.tsx`
- Create: `apps/web/tests/home-discover.test.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/discover/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- `GameCover({ game, size?: 'card' | 'compact', priority?: boolean, ownerGameId?: string })` renders `/api/games/<ownerGameId>/cover/<coverVersion>` for an authenticated workspace, `/api/covers/<encoded-slug>/<coverVersion>` for public cards, or a deterministic TFG fallback when the version is zero.
- `GameCard({ game, compact?: boolean })` keeps the public `/games/:slug` link and uses `GameCover`.
- Home requests `GET /discover?limit=4` server-side and tolerates API failure by retaining the creator-focused sections without a broken game grid.

- [x] **Step 1: Extend failing card/page tests**

Assert real cover URL encoding, 16:9 fallback, whole-card link, Vietnamese labels, four creation methods, three-step process, and Discover empty/error copy. Include:

```tsx
expect(screen.getByRole('img', { name: 'Ảnh bìa Tiny Quest' }))
  .toHaveAttribute('src', expect.stringContaining('/api/covers/tiny-quest/2'));
expect(screen.getByTestId('game-cover-fallback')).toHaveTextContent('TQ');
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter web test -- tests/game-card.test.tsx tests/home-discover.test.tsx`

Expected: FAIL on absent cover behavior and English/minimal pages.

- [x] **Step 3: Implement covers, cards, Home, and Discover**

Use a deterministic CSS custom-property hue derived from the slug with a pure helper exported for tests. Render an `<img>` only for a positive version, choose the owner or public URL from `ownerGameId`, and preserve `aspect-ratio: 16 / 9`. Translate search, empty, error, developer, and pagination copy. Keep server rendering and no-JavaScript link/search behavior.

- [x] **Step 4: Verify GREEN and commit**

Run: `pnpm --filter web test -- tests/game-card.test.tsx tests/home-discover.test.tsx && pnpm --filter web typecheck && pnpm --filter web lint`

Expected: component/page tests PASS with no hydration warnings.

```bash
git add apps/web/app apps/web/components apps/web/tests
git commit -m "feat(web): redesign TFG home and discovery"
```

---

### Task 6: Redesign and translate account, Studio, workspace, and moderation surfaces

**Files:**
- Create: `apps/web/components/cover-uploader.tsx`
- Modify: `apps/web/components/auth-form.tsx`
- Modify: `apps/web/components/profile-form.tsx`
- Modify: `apps/web/components/game-form.tsx`
- Modify: `apps/web/components/game-workspace.tsx`
- Modify: `apps/web/components/game-preview.tsx`
- Modify: `apps/web/components/upload-editor.tsx`
- Modify: `apps/web/components/code-game-editor.tsx`
- Modify: `apps/web/components/story-game-editor.tsx`
- Modify: `apps/web/components/platformer-game-editor.tsx`
- Modify: `apps/web/components/moderation-queue.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/register/page.tsx`
- Modify: `apps/web/app/profile/page.tsx`
- Modify: `apps/web/app/studio/page.tsx`
- Modify: `apps/web/app/studio/games/new/page.tsx`
- Modify: `apps/web/app/studio/games/[id]/page.tsx`
- Modify: `apps/web/app/moderation/page.tsx`
- Modify: `apps/web/tests/forms.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- `CoverUploader({ game, onUploaded })` accepts `.jpg,.jpeg,.png,.webp`, posts multipart `cover`, and replaces local `GameSummary` with the API response.
- `GameForm` and the workspace display-settings panel post `viewportWidth` and `viewportHeight`; the latter uses the existing authenticated `PATCH /games/:id` route.
- Existing editor props and API routes remain unchanged.
- Review labels become `Bản nháp`, `Chờ duyệt`, `Đã duyệt`, and `Bị từ chối` without changing enum values.

- [x] **Step 1: Write failing Vietnamese workflow and cover-uploader component tests**

Update assertions to Vietnamese accessible names and add:

```tsx
await user.upload(screen.getByLabelText('Ảnh bìa game'), file);
await user.click(screen.getByRole('button', { name: 'Tải ảnh bìa lên' }));
expect(fetch).toHaveBeenCalledWith('/api/games/game-1/cover', expect.objectContaining({
  method: 'POST',
  body: expect.any(FormData),
}));
expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ coverVersion: 1 }));
```

Assert a failed request re-enables the button and retains the existing preview.

- [x] **Step 2: Run form tests and verify RED**

Run: `pnpm --filter web test -- tests/forms.test.tsx`

Expected: FAIL on English copy, absent cover uploader, and old flat workspace structure.

- [x] **Step 3: Implement translated panels without changing business logic**

Translate labels/messages and wrap existing controls in semantic page headers, panels, status badges, and action bars. Add `CoverUploader` to `GameWorkspace`, show `GameCover` with `ownerGameId={game.id}` beside metadata, and keep the returned summary in the same `game` state used by submit/build actions. Add numeric viewport width/height fields (1–4096, default 16×9) to creation and workspace display settings. Keep native form methods, names, and redirect semantics intact.

- [x] **Step 4: Verify GREEN and commit**

Run: `pnpm --filter web test -- tests/forms.test.tsx && pnpm --filter web typecheck && pnpm --filter web lint`

Expected: all form/editor tests PASS.

```bash
git add apps/web/app apps/web/components apps/web/tests/forms.test.tsx
git commit -m "feat(web): redesign creator and moderation workflows"
```

---

### Task 7: Add disabled-by-default AdSense adapter

**Files:**
- Create: `apps/web/components/ad-slot.tsx`
- Create: `apps/web/components/adsense-script.tsx`
- Create: `apps/web/lib/adsense-config.ts`
- Create: `apps/web/tests/ad-slot.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/Dockerfile`
- Modify: `compose.production.yml`
- Modify: `.env.production.example`

**Interfaces:**
- `adsenseConfig()` returns `{ enabled: false }` or `{ enabled: true, client: 'ca-pub-...', slots: { gameLeftTop, gameLeftBottom } }`.
- `AdSlot({ slot, label })` renders a stable placeholder in disabled/invalid mode and an `<ins class="adsbygoogle">` only in enabled valid mode.
- `AdsenseScript` is rendered once in the root layout only for valid enabled configuration.

- [x] **Step 1: Write failing configuration and component tests**

Cover disabled, incomplete, malformed client, malformed numeric slot, and valid enabled configuration. Assert disabled/invalid states contain `Quảng cáo` and no script/`adsbygoogle`; valid mode uses `data-ad-client`, `data-ad-slot`, and `data-ad-format="auto"`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web test -- tests/ad-slot.test.tsx`

Expected: FAIL because the ad adapter does not exist.

- [x] **Step 3: Implement guarded build-time configuration**

Use `NEXT_PUBLIC_ADSENSE_ENABLED`, `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT`, and `NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT`. Accept enabled only when the flag is exactly `true`, client matches `/^ca-pub-\d+$/`, and both slots match `/^\d+$/`. Pass these as Docker build args; set `NEXT_PUBLIC_ADSENSE_ENABLED=false` in the current production environment example/deployment.

- [x] **Step 4: Verify GREEN and commit**

Run: `pnpm --filter web test -- tests/ad-slot.test.tsx && pnpm --filter web typecheck && pnpm --filter web lint && docker compose -f compose.production.yml config`

Expected: tests and config validation PASS; rendered disabled pages do not contain `pagead2.googlesyndication.com`.

```bash
git add apps/web compose.production.yml .env.production.example
git commit -m "feat(web): add guarded AdSense slots"
```

---

### Task 8: Build the viewport-fitted three-column game player and fullscreen behavior

**Files:**
- Create: `apps/web/components/game-player.tsx`
- Create: `apps/web/components/related-games.tsx`
- Create: `apps/web/tests/game-player.test.tsx`
- Modify: `apps/web/app/games/[slug]/page.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/game-card.test.tsx`

**Interfaces:**
- `GamePlayer({ title, src, viewportWidth, viewportHeight })` owns a wrapper ref, fullscreen request/exit, error status, calculates the fit box from the positive dimensions, and renders an iframe with `scrolling="no"`, `sandbox="allow-scripts allow-pointer-lock"`, and title `Chơi <title>`.
- `RelatedGames({ games, currentSlug })` filters current slug and renders at most six compact `GameCard`s.
- Game page fetches `/games/by-slug/:slug` plus `/discover?limit=7`; related-data failure does not prevent play.

- [x] **Step 1: Write failing player and related-game tests**

Assert iframe attributes, accessible fullscreen control, `requestFullscreen` target, `exitFullscreen`, `fullscreenchange` state, rejection status, no iframe `src` change, current-game exclusion, and six-item cap:

```tsx
await user.click(screen.getByRole('button', { name: 'Mở toàn màn hình' }));
expect(player.requestFullscreen).toHaveBeenCalledOnce();
fireEvent(document, new Event('fullscreenchange'));
expect(screen.getByRole('button', { name: 'Thoát toàn màn hình' })).toBeVisible();
expect(screen.getByTitle('Chơi Tiny Quest')).toHaveAttribute('scrolling', 'no');
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web test -- tests/game-player.test.tsx tests/game-card.test.tsx`

Expected: FAIL because the player and related list do not exist.

- [x] **Step 3: Implement `GamePlayer` and `RelatedGames`**

Catch synchronous and rejected fullscreen calls, announce `Không thể mở toàn màn hình trên trình duyệt này.`, and never remount the iframe when fullscreen changes. Use the existing `/api/play/<slug>/` source and sandbox string unchanged.

- [x] **Step 4: Compose and size the desktop layout**

Use a page class with `grid-template-columns: minmax(180px,220px) minmax(0,1fr) minmax(260px,300px)` and a player height derived from `100dvh - header - page gaps`. Place two `AdSlot`s left, player center, and `RelatedGames` right. Compute a contained inner box from `viewportWidth / viewportHeight`, apply `overflow: hidden` to it and the iframe, and add `:fullscreen` styles that recompute the largest contained box on a dark surface. Put description/developer content below this grid.

At widths below the three-column minimum, collapse sidebars below the player only as a damage-prevention fallback; do not add mobile navigation or touch-specific UI.

- [x] **Step 5: Verify GREEN and commit**

Run: `pnpm --filter web test -- tests/game-player.test.tsx tests/game-card.test.tsx && pnpm --filter web typecheck && pnpm --filter web lint`

Expected: player and related tests PASS and the iframe keeps the same `src` through fullscreen transitions.

```bash
git add apps/web/app/games apps/web/components apps/web/tests apps/web/app/globals.css
git commit -m "feat(web): add immersive desktop game player"
```

---

### Task 9: Update browser harness and cover all redesigned journeys

**Files:**
- Modify: `apps/web/e2e/api-harness.mjs`
- Modify: `apps/web/e2e/account-game-flow.spec.ts`
- Modify: `apps/web/playwright.config.ts`

**Interfaces:**
- The test harness implements cover upload/read persistence in an isolated temporary root while retaining production controllers/services.
- Browser suite uses Vietnamese accessible names and adds projects or parameterized tests for 1280×720, 1440×900, and 1920×1080.

- [x] **Step 1: Update existing assertions and add failing end-to-end acceptance tests**

Add tests that:

```ts
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`player fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/games/tiny-quest');
    const box = await page.getByTestId('game-player').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByTestId('game-player-frame')).toHaveAttribute('scrolling', 'no');
  });
}
```

Also cover theme persistence across reload, dark/system behavior, upload and display of a real tiny PNG, fallback cover, fullscreen enter/exit without frame reload, related exclusion, and zero requests whose host contains `googlesyndication.com` or `doubleclick.net`.

- [x] **Step 2: Run the browser suite and verify RED**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e`

Expected: FAIL until all translated selectors, harness cover persistence, and visual/player acceptance assertions align.

- [x] **Step 3: Make only test-infrastructure corrections exposed by the new acceptance suite**

Update seeded/in-memory rows with cover metadata, provide an isolated writable `GAME_STORAGE_ROOT`, reset it between runs, and change selectors to the approved Vietnamese labels. Do not weaken production assertions or add time-based sleeps; wait on visible state, response, URL, or fullscreen state.

- [x] **Step 4: Run full web/API verification and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e && pnpm --filter api test && pnpm --filter api test:e2e -- --runInBand`

Expected: all web unit, browser E2E, API unit, and API E2E tests PASS with zero failures.

```bash
git add apps/web/e2e apps/web/playwright.config.ts
git commit -m "test: cover redesigned TFG desktop journeys"
```

---

### Task 10: Production contracts, documentation, and release gate

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/api/foundation.md`
- Modify: `scripts/test-deployment-config.mjs`
- Modify: `scripts/test-deployment-runbook.mjs`
- Modify: `scripts/test-restore-runbook.mjs`
- Modify: `README.md` if it still displays IndieForge or English product copy
- Modify: `docs/superpowers/plans/2026-09-07-tfg-desktop-ui-redesign.md` (check completed boxes only while executing)

**Interfaces:**
- Documents cover endpoints, 5 MiB/type constraints, TFG UI, theme behavior, fullscreen acceptance, and AdSense environment variables.
- Production verification proves ads are disabled without IDs and cover bytes share the backed-up volume without being treated as executable artifacts.

- [x] **Step 1: Write failing production-contract checks**

Extend the compose verification to require the four `NEXT_PUBLIC_ADSENSE_*` build args, assert the enable flag is `false` for the test deployment, and reject an enabled configuration with missing/malformed IDs. Extend backup/restore fixtures with a cover file under `covers/game-id/1/cover` and assert its SHA-256 survives restore beside artifact files.

- [x] **Step 2: Run contract drills and verify RED**

Run: `pnpm test:deploy-config && node scripts/test-deployment-runbook.mjs && node scripts/test-restore-runbook.mjs`

Expected: FAIL because ad build contracts and cover restore assertions are not yet present/configured.

- [x] **Step 3: Update deployment/API documentation and scripts**

Document exact routes:

```text
POST /games/:id/cover             owner multipart upload (`cover`)
GET  /games/:id/cover/:version    authenticated owner preview
GET  /covers/:slug/:version       approved public cover
```

Document `NEXT_PUBLIC_ADSENSE_ENABLED=false` as the safe default and state that CSP must be deliberately expanded before enabling real AdSense. Update the backup drill to archive and restore the entire game-storage root, including `covers/`, with checksum comparison.

- [x] **Step 4: Run the complete release gate**

Run all commands from a clean shell:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter api test:e2e -- --runInBand
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web e2e
pnpm build
pnpm test:deploy-config
node scripts/test-deployment-runbook.mjs
node scripts/test-restore-runbook.mjs
pnpm test:containers
docker compose -f compose.production.yml --env-file .env.production config
docker build -f apps/api/Dockerfile -t indieforge-api:tfg-ui .
docker build -f apps/web/Dockerfile -t indieforge-web:tfg-ui \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  --build-arg NEXT_PUBLIC_ADSENSE_ENABLED=false .
```

Expected: every command exits 0; all test summaries report zero failures; both images build; Compose exposes only Caddy ports.

- [x] **Step 5: Commit release documentation and contract checks**

```bash
git add README.md docs scripts compose.production.yml .env.production.example
git commit -m "docs: prepare TFG UI production rollout"
```

---

### Task 11: Backup, deploy, and verify production through the public origin

**Files:**
- No source files created or edited during this task.
- Runtime outputs: timestamped PostgreSQL custom dump, game-storage archive, and SHA-256 manifest in the established protected backup directory.

**Interfaces:**
- Uses the existing `deploy/ip-preview` Compose project and volumes.
- Public acceptance origin remains `http://161.248.81.59` until a domain/HTTPS change is separately authorized.

- [x] **Step 1: Capture pre-deploy state and create a consistent verified backup**

Record container/image IDs, migration status, database game/user counts, artifact count, cover count, and the public snake-game HTTP status. Follow the established brief API/web pause backup procedure, create PostgreSQL custom dump plus the entire game-storage archive, chmod backup files owner-only, generate SHA-256, test-list both archives, and restart only the old containers. Abort rollout if old health does not return.

- [x] **Step 2: Apply migration and replace only application containers**

Run the new one-shot migration container, then recreate API and web with the verified images while retaining PostgreSQL, game-storage, Caddy data, and Caddy config volumes. Keep `NEXT_PUBLIC_ADSENSE_ENABLED=false`. Do not merge branches or create a PR.

- [x] **Step 3: Run production smoke and desktop acceptance**

Verify through `http://161.248.81.59`:

```text
GET /api/health -> 200
GET / -> TFG Vietnamese creator-first home
GET /discover -> cover cards and fallback cards
GET /games/ran-san-moi-neon -> 200, no iframe scrollbar, input works
```

Use Playwright at all three approved desktop viewports in light and dark themes. Enter/exit fullscreen with a real user click, confirm the iframe URL remains unchanged, confirm current game is absent from the right rail, and assert no Google ad-domain requests.

Create a disposable draft owner, select a non-16:9 viewport, upload a valid cover, reject invalid/oversized covers, build and submit a game, approve it with a temporary moderator, and confirm its cover becomes public. Update Rắn Săn Mồi Neon to a 1×1 viewport through the owner workflow, resubmit/reapprove it if the metadata update resets its review state, and verify its square fit. Remove or demote only disposable credentials using the established cleanup procedure.

- [x] **Step 4: Prove persistence and capture final evidence**

Record artifact and cover checksums, restart only API, then confirm checksums/counts are unchanged and both snake-game play plus the newly approved public cover return 200. Confirm all containers are healthy and only Caddy publishes host ports.

- [x] **Step 5: Mark the plan complete without changing branch topology**

Check completed boxes in this plan, commit the execution record, and retain branch `deploy/ip-preview` without merge or PR:

```bash
git add docs/superpowers/plans/2026-09-07-tfg-desktop-ui-redesign.md
git commit -m "docs: record TFG desktop UI release"
```


## Release execution record — 2026-09-08

All task checkboxes reflect the accepted Task 1–10 execution reports and release gate, plus the production verification below. The branch remains `deploy/ip-preview`; no merge or PR was created.

Production uses the existing `deploy-ip-preview` Compose project and volumes at `http://161.248.81.59`. Verified PostgreSQL and complete-storage backup: `backups/20260908T001552-1590330` with owner-only archives and SHA-256 manifest. The cover migration applied once; the verified API/web release images are healthy; only Caddy publishes ports and AdSense remains disabled.

Public acceptance passed cover upload/privacy/invalid-file/oversize checks, build/submission/approval, real and fallback cards, themes, all three desktop viewports, real-click fullscreen without iframe reload, input, and zero Google ad requests. The owner set Rắn Săn Mồi Neon to 1×1 and resubmitted it. A later explicit user authorization allowed a CSS-only responsive correction to this game's artifact: version 3 preserves its original HTML and JavaScript byte-for-byte and fits the complete board/controls at 1280×720, 1440×900, and 1920×1080 in both themes, normal/fullscreen. The intrinsic-fit check failed before this correction and passed afterward.

Final API-only restart preserved all 36 current files and sealed modes: 16 artifacts, 2 covers; SHA-256 of the path/hash/mode manifest is `ee18e885a9db99b943e64da214926d16d4df5b04e578e4db13cb894c9dae7c24`. All 18 original artifact files still match the pre-deploy backup. Health, snake play, and the approved cover return 200. Disposable moderator roles were revoked; credentials were never persisted.

Deferred review items remain explicit: the existing source-generated `Unknown developer` fallback is a localization Minor, and native Escape fullscreen exit is unverified in headless Chrome; real-click entry/exit and state preservation passed. Detailed checkpoints, hashes, screenshots, and selector-debugging evidence are retained in the ignored Task 11 execution report.
