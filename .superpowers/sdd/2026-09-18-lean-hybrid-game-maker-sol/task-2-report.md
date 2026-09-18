# Task 2 report — Make upload the quickest publishing path

## Delivered

- The HTML5 ZIP editor now explains the accepted package: root `index.html`,
  relative in-ZIP assets, 25 MiB compressed, 100 MiB expanded, and 1,000-entry
  limits.
- Upload has an accessible in-flight state with the selected filename and a
  progress indicator, then a success state that tells the creator the preview
  is ready. Rejected uploads show the mapped API reason and relabel the enabled
  action as an explicit retry.
- The implementation continues to call the established authenticated
  `POST /games/:id/upload` API. It does not create a publication path or alter
  preview/public iframe sandboxing.
- `lean-upload.spec.ts` adds the missing deterministic acceptance journey:
  root `index.html` plus a relative SVG asset, owner preview and reload,
  submission, moderator approval, anonymous public play, and an authenticated
  second creator receiving `403` for an attempted replacement.

## Existing protection evidence retained

No game-content service or storage behavior was changed. Its focused suite
already uses independent ZIP fixtures for a root document with nested relative
asset, missing root entry, traversal paths, symbolic links, encrypted/duplicate
entries, entry count, actual expanded-size limits, and rejected replacement
retention. It also verifies immutable prior artifact reads and review reset on a
successful replacement. Those passing protections were not duplicated.

The API remains the authorization boundary: the owner guard runs before
multipart parsing, upload resets review to draft rather than publishing, and
artifact installation retains immutable versions. Creator bytes remain delivered
only through the existing opaque, no-`allow-same-origin` sandbox.

## Verification

- `pnpm --filter web exec vitest run tests/forms.test.tsx` — 44 passed.
- `pnpm --filter api exec vitest run src/games/game-content.service.spec.ts` —
  36 passed.
- `pnpm --filter web typecheck` — completed successfully.
- `pnpm --filter web exec playwright test --list e2e/lean-upload.spec.ts` —
  the new acceptance test is discovered.

Browser execution was attempted with `pnpm --filter web e2e --
lean-upload.spec.ts`, which starts the isolated API/web harness. It could not
execute the test body because this environment lacks Playwright Chromium:
`browserType.launch: Executable doesn't exist at .../chromium_headless_shell-1243/...`.
The harness was stopped after that failure; no browser success is claimed.

## Fix round 1 — unique upload success locator

Changed `apps/web/e2e/lean-upload.spec.ts` only. The post-upload success
assertion now resolves `role=status` inside the labelled `Tải trò chơi HTML5`
region, rather than across the page. This prevents strict-mode ambiguity with
the workspace's existing review-state status.

RED/GREEN record: before the change, inspection found two matching live regions
(`Bản nháp` in the workspace and the upload success status), so Playwright
strict mode would reject the page-wide locator. Browser RED/GREEN execution is
not possible in this environment because Chromium is absent (the prior run
failed before the test body with the recorded missing executable). The changed
test is syntactically discovered by
`pnpm --filter web exec playwright test --list e2e/lean-upload.spec.ts`; the
same command reports one test. `pnpm --filter web exec eslint
e2e/lean-upload.spec.ts` and `pnpm --filter web exec tsc --noEmit` completed
without errors. No browser pass is claimed.
