# Task 5 Report — Make one template prove the engine

## Summary

Initial checkpoint added a bounded compiled-artifact proof and tightened ENGINE build provenance coverage:

- `apps/web/e2e/lean-pixel-maker.spec.ts` builds a deterministic edited Pixel Adventure document from the canonical factory, compiles it with the real ENGINE HTML compiler, and drives the generated player with browser keyboard and directional-control input.
- The browser proof asserts imported image rendering through canvas pixels, blocked movement, score increase, win/restart, damage/loss, valid script execution, and invalid script diagnostics without editing runtime state after load.
- The temporary `packages/contracts` re-export of `compileEngineHtml` from that checkpoint was removed in Fix Round 1 when the browser spec moved to real Studio authoring/building.
- `apps/api/src/games/engine-build.service.spec.ts` now asserts compiled HTML references copied owned assets and returns the exact canonical head revision number.

The interrupted direct runtime-state acceptance-style test in `packages/engine-core/src/templates/pixel-adventure.test.ts` was not retained. It drove player/object positions by mutating runtime internals, so it was not valid browser acceptance evidence for this task.

## TDD Evidence

Initial RED retained from the interrupted API test:

- Command: `pnpm --filter api test -- src/games/engine-build.service.spec.ts`
- Result: failed as expected, `expected undefined to be 4`, because the test fixture omitted `headRevision.revisionNumber` while production already returns it.

GREEN after fixture correction:

- Command: `pnpm --filter api exec vitest run src/games/engine-build.service.spec.ts`
- Result: `Test Files 1 passed (1)`, `Tests 3 passed (3)`

Browser coverage discovery:

- Command: `pnpm --filter web exec playwright test e2e/lean-pixel-maker.spec.ts --list`
- Result: listed exactly `lean-pixel-maker.spec.ts:328:1 › compiled pixel adventure proves imported art, rules, input, scripts and restart`

## Verification

Passed:

- `pnpm --filter @indieforge/contracts build`
- `pnpm --filter @indieforge/engine-core exec vitest run src/templates/pixel-adventure.test.ts` — `Test Files 1 passed (1)`, `Tests 5 passed (5)`
- `pnpm --filter api exec vitest run src/games/engine-build.service.spec.ts` — `Test Files 1 passed (1)`, `Tests 3 passed (3)`
- `pnpm --filter web test -- tests/studio-shell.test.tsx` — `Test Files 1 passed (1)`, `Tests 38 passed (38)`
- `pnpm --filter web typecheck`
- `pnpm --filter web exec eslint e2e/lean-pixel-maker.spec.ts`
- `pnpm --filter web exec playwright test e2e/lean-pixel-maker.spec.ts --list`
- `git diff --check`

Browser run blocker:

- Command: `pnpm --filter web exec playwright test e2e/lean-pixel-maker.spec.ts`
- Result: failed before executing test body because Chromium is not installed in this environment.
- Exact blocker: `browserType.launch: Executable doesn't exist at /home/codexproxy/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
- Per task instruction, no speculative browser install was attempted.

## Scope Notes

- This checkpoint does not claim full Task 5 browser acceptance because Chromium could not launch.
- The new deterministic browser spec is ready to run when the environment supplies Chromium.
- Existing Studio shell unit coverage still covers canonical script save/reload and preview invalidation behavior; the new browser proof covers the compiled playable artifact path.
- The untracked plan document `docs/superpowers/plans/2026-09-18-lean-hybrid-game-maker-sol.md` was preserved and not staged.
- No merge, push, or deployment was performed.

## Fix Round 1 — Review P0 Gaps

Review finding:

- The original browser spec used `proofProject()`, `page.setContent()` and direct `compileEngineHtml()` compilation. That was useful as supporting compiler/player coverage, but it did not prove the real authoring journey required by Task 5.

Changes:

- Replaced `apps/web/e2e/lean-pixel-maker.spec.ts` with a real Studio/API journey:
  - browser UI registration and Pixel Adventure draft creation;
  - browser UI PNG upload through the asset manager;
  - canonical persisted API mutations for deterministic sprite replacement, obstacle reposition, collectible/exit/hazard creation and visual-rule equivalents;
  - Studio reload and canonical project assertions;
  - script save/reload through the Code panel;
  - build through the Studio play panel;
  - sandboxed iframe play with keyboard and pointer control input;
  - asset-specific canvas assertion for the uploaded magenta PNG;
  - score, blocked movement, win, restart, damage, loss, invalid script diagnostics, and preview invalidation after an edit.
- Removed the `compileEngineHtml` contracts export because the e2e acceptance spec no longer compiles artifacts directly.
- Kept the API build provenance test from the first checkpoint as supporting coverage.

Fix Round 1 RED evidence:

- Command: `rg -n "proofProject|setContent|compileEngineHtml" apps/web/e2e/lean-pixel-maker.spec.ts`
- Result before fix: matched the invalid shortcut at `compileEngineHtml`, `proofProject`, and `page.setContent`.

Fix Round 1 verification:

- `rg -n "proofProject|setContent|compileEngineHtml" apps/web/e2e/lean-pixel-maker.spec.ts packages/contracts/src/index.ts || true` — no matches
- `pnpm --filter @indieforge/contracts build` — passed
- `pnpm --filter web exec eslint e2e/lean-pixel-maker.spec.ts` — passed
- `pnpm --filter web exec playwright test e2e/lean-pixel-maker.spec.ts --list` — listed `Studio authors, persists, builds and plays the edited Pixel Adventure`
- `pnpm --filter web exec playwright test e2e/lean-pixel-maker.spec.ts` without opt-in env — passed with `1 skipped`
- `git diff --check` — passed

Remaining blocker:

- Full execution of the browser journey requires `E2E_EXTERNAL_SERVICES=1 E2E_LEAN_PIXEL_MAKER=1` with a disposable API/PostgreSQL/storage stack and Chromium available. This environment still must not be modified by speculative browser installation.
