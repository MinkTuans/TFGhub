# Task 1 report: deterministic self-validating fixture helper

## Implementation

- Added `apps/api/test/web-engine-fixtures.ts` with exported `SyntheticEngineKind`, fixture/manifest interfaces, `createSyntheticWebEngineFixture`, and `validateSyntheticWebEngineFixture`.
- Generates deterministic Unity-shaped and Godot-shaped ZIPs containing `index.html`, `loader.js`, the eight-byte valid WASM header/module, and the engine-specific payload.
- Computes entry and archive SHA-256 values at runtime, reopens returned ZIP bytes with `yauzl`, validates required paths, duplicate paths, MIME contracts, payload hashes, and archive hash, then regenerates and compares archive/manifest deterministically.
- Added `apps/api/test/web-engine-fixtures.spec.ts` covering both labels plus archive and manifest digest tampering.

## Test evidence

- RED: `pnpm --filter api exec vitest run test/web-engine-fixtures.spec.ts` failed because `./web-engine-fixtures.js` did not exist.
- GREEN: the same command passes: 1 test file, 6 tests passed.
- Formatting: `pnpm --filter api exec prettier --check test/web-engine-fixtures.ts test/web-engine-fixtures.spec.ts` passes.
- Lint: `pnpm --filter api exec oxlint test/web-engine-fixtures.ts test/web-engine-fixtures.spec.ts` passes with no warnings after cleanup.
- `git diff --check` passes.

## Files

- `apps/api/test/web-engine-fixtures.ts`
- `apps/api/test/web-engine-fixtures.spec.ts`

## Self-review and concerns

- No production, API, schema, CSP, sandbox, network, or allowlist files were changed.
- The repository-wide API TypeScript check currently reports unrelated pre-existing errors in other tests; the fixture files produced no reported type errors before those existing failures.
- The pre-existing untracked `docs/superpowers/plans/2026-09-18-lean-hybrid-game-maker-sol.md` was not staged.

## Review fixes

- Reordered `buildOnce` so source entry sizes and SHA-256 values are computed before deterministic ZIP creation; ZIP hashing and manifest assembly follow packaging.
- Added archive tampering coverage that refreshes the manifest ZIP digest, forcing ZIP reopening/inspection rather than stopping at the archive digest guard.
- Added manifest integrity coverage for per-entry SHA-256, path, and MIME mutations.

Fix verification:

- `pnpm --filter api exec vitest run test/web-engine-fixtures.spec.ts`: 1 file, 10 tests passed.
- `pnpm --filter api exec prettier --check test/web-engine-fixtures.ts test/web-engine-fixtures.spec.ts`: passed.
- `pnpm --filter api exec oxlint test/web-engine-fixtures.ts test/web-engine-fixtures.spec.ts`: passed.
