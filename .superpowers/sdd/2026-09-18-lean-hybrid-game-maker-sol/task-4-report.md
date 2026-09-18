# Task 4 Report — Finish minimum no-code gameplay loop

## Summary

Implemented the P0 no-code gameplay loop in the visual gameplay panel:

- Existing supported rules can be edited through the canonical `event.upsert` workflow.
- Stable event/action IDs are preserved when editing existing rules.
- Ordered actions are supported for the practical loop, including score + audio + win.
- Score `>=` conditions can be authored for exit/win rules.
- Trigger target selectors are scoped to compatible objects in the active scene.
- Missing targets produce a visible validation error and do not mutate project state.
- Unsupported complex rules remain read-only with an explanation, while toggle/delete remains available.
- Runtime coverage now includes timer-authored supported actions respecting pause/restart.

No new dependencies were added. Browser/manual checks were not run; prior instructions noted browser checks are environment-blocked, so no browser success is claimed.

## Files Changed

- `apps/web/components/studio/visual-gameplay-panel.tsx`
- `apps/web/tests/studio-shell.test.tsx`
- `packages/engine-core/src/v2/mutations.test.ts`
- `packages/engine-core/src/runtime/game-runtime.test.ts`

## TDD Evidence

Initial RED for the main Studio behavior:

- Command: `pnpm --filter web test -- tests/studio-shell.test.tsx`
- Expected failure observed: unable to find button `Sửa Nhặt xu`, proving existing-rule editing was missing.

GREEN after implementation:

- Command: `pnpm --filter web test -- tests/studio-shell.test.tsx`
- Result: `Test Files 1 passed (1)`, `Tests 36 passed (36)`

Engine mutation/history coverage:

- Command: `pnpm --filter @indieforge/engine-core test -- src/v2/mutations.test.ts`
- Result: `Test Files 16 passed (16)`, `Tests 419 passed (419)`

Runtime coverage:

- Command: `pnpm --filter @indieforge/engine-core test -- src/runtime/game-runtime.test.ts`
- Result: `Test Files 16 passed (16)`, `Tests 419 passed (419)`

## Verification

Passed:

- `pnpm --filter web typecheck`
- `pnpm --filter @indieforge/engine-core typecheck`
- `pnpm --filter web test -- tests/studio-shell.test.tsx`
- `pnpm --filter @indieforge/engine-core test -- src/v2/mutations.test.ts`
- `pnpm --filter @indieforge/engine-core test -- src/runtime/game-runtime.test.ts`
- `git diff --check`

Known lint caveat:

- `pnpm --filter web lint` still fails on pre-existing, unrelated findings:
  - `apps/web/components/studio/hierarchy-panel.tsx:198`
  - `apps/web/components/studio/studio-task-panels.tsx:371`
  - `apps/web/components/studio/studio-task-panels.tsx:624`
- `visual-gameplay-panel.tsx` no longer reports lint errors after cleanup.

## Notes

- The untracked plan document `docs/superpowers/plans/2026-09-18-lean-hybrid-game-maker-sol.md` was preserved and not staged.
- No merge, push, or deployment was performed.

## Fix Round 1

Addressed three review findings:

- Collect and enter rules now require the practical player target. Scenes with an eligible item/exit but no compatible player show visible validation and do not mutate.
- Collect target filtering now matches runtime eligibility: same-scene `ITEM` objects must have `InventoryItem.collectible === true` and a runtime bounds component (`Collider` or `Trigger`). Enter target filtering now requires same-scene `TRIGGER` objects with runtime bounds.
- Trigger and active-scene changes invalidate stale saved target IDs. The form now requires fresh selections before committing after those changes.

Round 1 RED evidence:

- Command: `pnpm --filter web test -- tests/studio-shell.test.tsx`
- Result: failed as expected, `Tests 2 failed | 36 passed (38)`.
- Expected failures:
  - no alert/no-mutation guard when an item/exit existed without a compatible player;
  - stale trigger/scene choices silently fell back and created an event instead of requiring fresh target choices.

Round 1 GREEN evidence:

- Command: `pnpm --filter web test -- tests/studio-shell.test.tsx`
- Result: `Test Files 1 passed (1)`, `Tests 38 passed (38)`

Round 1 verification:

- `pnpm --filter web typecheck` passed.
- `git diff --check` passed.
- `pnpm --filter web lint` still fails only on the previously documented unrelated findings:
  - `apps/web/components/studio/hierarchy-panel.tsx:198`
  - `apps/web/components/studio/studio-task-panels.tsx:371`
  - `apps/web/components/studio/studio-task-panels.tsx:624`
