# Task 5 Report — Make one template prove the engine

## Summary

Added a bounded browser proof for the pixel adventure artifact path and tightened ENGINE build provenance coverage:

- `apps/web/e2e/lean-pixel-maker.spec.ts` builds a deterministic edited Pixel Adventure document from the canonical factory, compiles it with the real ENGINE HTML compiler, and drives the generated player with browser keyboard and directional-control input.
- The browser proof asserts imported image rendering through canvas pixels, blocked movement, score increase, win/restart, damage/loss, valid script execution, and invalid script diagnostics without editing runtime state after load.
- `packages/contracts` now re-exports `compileEngineHtml` so web-side tests use a declared workspace dependency instead of reaching through a transitive package.
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
