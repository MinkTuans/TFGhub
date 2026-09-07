# Final broad-review fixes report

## Scope

Resolved all five Important findings and both Minor findings without touching
the deployed production stack.

## Changes

- Moderation actions now carry the observed `artifactVersion` and `submittedAt`.
  The PostgreSQL conditional update requires both values plus `PENDING`, so an
  action for an old queue card returns 409 after an owner changes and resubmits.
- Metadata edits while `PENDING` now atomically invalidate the submission and
  return it to `DRAFT`. Existing `updatedAt` optimistic concurrency continues
  to prevent an owner edit from overwriting a concurrent moderator action.
- Story and platformer list keys are deterministic for initial render and use a
  component-local monotonic counter for additions; neither needs
  `crypto.randomUUID` in SSR or restricted HTTP browser contexts.
- Every browser-facing preview iframe uses `resolvePublicApiBaseUrl`; the public
  player already did so. A server-render test uses deliberately different
  internal/public hosts and proves the internal hostname is absent.
- The compiled platformer supports ArrowUp/Space jump while grounded and `R`
  restart, which resets player position, velocity and goal status. Canvas and
  iframe sizing is responsive.
- External browser moderation credentials are opt-in environment variables.
  Only the local harness retains deterministic defaults. Deployment docs cover
  registration, operator grant, run, immediate role revocation and credential
  cleanup without committing or reusing production credentials.
- Moderation cards show source type and the exact submitted timestamp.

## Regression evidence

- `pnpm --filter @indieforge/contracts test`: 14/14 passed.
- `pnpm --filter api test`: 82/82 passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter api test:e2e`: 60/60 passed, including v1 queue observation, metadata invalidation, v2 resubmission, stale v1 conflict and v2 approval.
- `pnpm --filter web test`: 35/35 passed.
- `pnpm --filter api typecheck`: passed.
- `pnpm --filter web typecheck`: passed.
- `pnpm --filter api lint`: passed.
- `pnpm --filter web lint`: passed.
- Focused real-Chrome moderation journey: passed.
- Focused real-Chrome platformer journey: passed; it jumps to an elevated
  platform/goal and then verifies `R` clears status and returns the player to
  the starting ground position.
- `git diff --check`: passed.

The root agent should still run the final branch-wide release gates and deploy;
this task intentionally performed no production mutation.
