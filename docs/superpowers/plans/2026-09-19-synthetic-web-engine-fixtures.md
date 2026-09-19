# Synthetic Web-Engine Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create self-validating synthetic Unity-WebGL-shaped and Godot-Web-shaped ZIP fixtures and exercise their ordinary upload-to-public-play lifecycle.

**Architecture:** A test-only helper creates deterministic ZIP bytes and a runtime manifest, then reopens the resulting archive to validate paths, MIME contract, hashes, and determinism before returning it. Existing API/browser tests consume only that returned fixture through the normal upload flow.

**Tech Stack:** TypeScript, Node `crypto`/`zlib`, yauzl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-synthetic-web-engine-fixtures-design.md`

## Global Constraints

- Test-only code: do not change API/schema/CSP/sandbox/network-policy/allowlist.
- Labels: `synthetic-unity-webgl`, `synthetic-godot-web`; provenance is always synthetic.
- Runtime-compute all entry and ZIP SHA-256 values; do not hard-code any digest.
- Required sequence: generate → hash → ZIP → inspect ZIP → required files → MIME/extension → deterministic hash → browser E2E.
- Report Synthetic Compatibility only; Real Engine Compatibility remains NOT VERIFIED.
- Do not stage existing untracked `docs/superpowers/plans/2026-09-18-lean-hybrid-game-maker-sol.md`.

---

### Task 1: Deterministic self-validating fixture helper

**Files:**

- Create: `apps/api/test/web-engine-fixtures.ts`
- Create: `apps/api/test/web-engine-fixtures.spec.ts`

**Interfaces:**

- Produces `createSyntheticWebEngineFixture(kind: SyntheticEngineKind): Promise<SyntheticWebEngineFixture>`.
- Produces `validateSyntheticWebEngineFixture(fixture: SyntheticWebEngineFixture): Promise<void>`.
- Fixture contains `archive: Buffer` and a runtime-generated manifest with per-file and ZIP SHA-256 values.

- [ ] **Step 1: Write failing fixture validation tests**

```ts
const fixture = await createSyntheticWebEngineFixture(kind);
await expect(validateSyntheticWebEngineFixture(fixture)).resolves.toBeUndefined();
expect(fixture.manifest.zipSha256).toBe(sha256(fixture.archive));
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter api exec vitest run test/web-engine-fixtures.spec.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement minimal generator and validator**

```ts
const fixture = await buildOnce(kind);
await validateSyntheticWebEngineFixture(fixture);
const repeat = await buildOnce(kind);
if (!fixture.archive.equals(repeat.archive) || !deepEqual(fixture.manifest, repeat.manifest))
  throw new Error('Synthetic fixture generation is not deterministic');
return fixture;
```

- [ ] **Step 4: Verify GREEN, then add negative checks**

Run: `pnpm --filter api exec vitest run test/web-engine-fixtures.spec.ts`

Expected: PASS for both labels; tampered archive and manifest each reject.

- [ ] **Step 5: Commit**

```sh
git add apps/api/test/web-engine-fixtures.ts apps/api/test/web-engine-fixtures.spec.ts
git commit -m "test(web-engine): add self-validating synthetic fixtures"
```

### Task 2: API/capability and opaque-sandbox evidence

**Files:**

- Modify: `apps/api/test/games.e2e-spec.ts`
- Uses: `apps/api/test/web-engine-fixtures.ts`

**Interfaces:** Consumes Task 1 helper; produces MIME/capability/browser evidence without policy expansion.

- [ ] **Step 1: Write failing E2E using each generated fixture**

```ts
const fixture = await createSyntheticWebEngineFixture(kind);
await developer.post(`/games/${game.id}/upload`).attach('game', fixture.archive, `${kind}.zip`).expect(201);
expect(response.headers['content-type']).toContain(requiredMime);
```

- [ ] **Step 2: Verify RED**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/games.e2e-spec.ts -t 'synthetic web engine'`

Expected: FAIL because no synthetic E2E exists.

- [ ] **Step 3: Add rendering/input/sandbox assertions and verify GREEN**

```ts
await frame.locator('canvas').press('ArrowRight');
await frame.locator('canvas').click({ position: { x: 4, y: 4 } });
expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
```

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/games.e2e-spec.ts -t 'synthetic web engine'`

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add apps/api/test/games.e2e-spec.ts
git commit -m "test(web-engine): exercise synthetic fixture delivery"
```

### Task 3: Full browser publication lifecycle

**Files:**

- Modify: `apps/web/e2e/lean-upload.spec.ts`
- Uses: `apps/api/test/web-engine-fixtures.ts`

**Interfaces:** Consumes a prevalidated fixture; produces preview/reload/input/moderation/public-play coverage.

- [ ] **Step 1: Write failing lifecycle coverage for both labels**

```ts
const fixture = await createSyntheticWebEngineFixture(kind);
await page.getByLabel('Tệp ZIP HTML5').setInputFiles({ name: `${kind}.zip`, mimeType: 'application/zip', buffer: fixture.archive });
```

- [ ] **Step 2: Verify RED**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web exec playwright test e2e/lean-upload.spec.ts -g 'synthetic'`

Expected: FAIL because synthetic lifecycle coverage does not exist.

- [ ] **Step 3: Add existing upload/approval lifecycle calls with canvas checks**

```ts
await expect(preview.contentFrame().getByTestId('synthetic-ready')).toHaveText('ready');
await preview.contentFrame().locator('canvas').press('ArrowRight');
await page.reload();
await page.getByRole('button', { name: 'Gửi duyệt' }).click();
```

- [ ] **Step 4: Verify GREEN**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web exec playwright test e2e/lean-upload.spec.ts -g 'synthetic'`

Expected: PASS for both labels.

- [ ] **Step 5: Commit**

```sh
git add apps/web/e2e/lean-upload.spec.ts
git commit -m "test(web): cover synthetic web engine publication"
```

### Task 4: Evidence and complete verification

**Files:**

- Modify: `docs/11-history/reports/2026-09-19-web-game-upload.md`

**Interfaces:** Consumes Tasks 1–3 evidence; produces accurate compatibility record.

- [ ] **Step 1: Record the boundary**

```md
Synthetic Compatibility: verified by self-validating fixtures.
Real Engine Compatibility: NOT VERIFIED.
```

- [ ] **Step 2: Run verification**

```sh
pnpm --filter api exec vitest run test/web-engine-fixtures.spec.ts src/games/game-content.service.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/games.e2e-spec.ts -t 'synthetic web engine|characterizes project-owned web engine capabilities'
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web exec playwright test e2e/lean-upload.spec.ts
pnpm --filter api typecheck
pnpm --filter web typecheck
```

- [ ] **Step 3: Scope review and commit**

```sh
git diff --check
git add docs/11-history/reports/2026-09-19-web-game-upload.md
git commit -m "docs(web-engine): distinguish synthetic compatibility"
```

## Plan self-review

Task 1 covers runtime hashes/self-inspection; Task 2 MIME/capability/sandbox; Task 3 upload through public play; Task 4 documentation and verification. No task permits a digest literal, policy change, or real-engine compatibility claim.

