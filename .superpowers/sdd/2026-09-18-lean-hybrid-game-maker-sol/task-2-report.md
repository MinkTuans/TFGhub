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
