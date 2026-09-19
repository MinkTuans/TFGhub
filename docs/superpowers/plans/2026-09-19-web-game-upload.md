# Web Game Upload Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Work sequentially with focused TDD and one commit per completed task. Read the spec before implementation.

**Goal:** Prioritize uploading lightweight 2D/3D web exports up to 100 MiB with verified Unity/Godot compatibility.

**Architecture:** Extend the existing UPLOAD ZIP and immutable capability-delivery pipeline. Keep export selection as UI guidance; preserve moderation and sandbox isolation.

**Tech Stack:** Existing NestJS, Next.js, TypeScript, yauzl, Vitest, Playwright, PostgreSQL and filesystem artifact storage.

**Spec:** `docs/superpowers/specs/2026-09-19-web-game-upload-design.md`

## Global Constraints

- ZIP: 104857600 compressed bytes; 419430400 actual expanded bytes; 2,000 entries including directories.
- Single root `index.html`; one multipart file `game`; existing source type UPLOAD.
- No `allow-same-origin`, server execution, silent publication or arbitrary file extensions.
- Initially target uncompressed, single-threaded web exports; actual versions/settings must be proven by fixtures.
- Preserve previous artifacts on every rejected replacement.
- Commit every completed task independently. Record blocked acceptance honestly; no skipped test counts as a pass.
- Existing untracked lean-hybrid plan belongs to prior work; do not stage it incidentally.

### Task 1: Establish actual engine export compatibility

**Files:** create `docs/11-history/reports/2026-09-19-web-game-upload.md`; inspect `apps/api/src/games/game-content.controller.ts`, `game-content.service.ts`, `apps/web/e2e/lean-upload.spec.ts`, `apps/web/playwright.config.ts`.

**Consumes:** current upload/capability contracts. **Produces:** versioned fixture requirements and measured sandbox constraints for Tasks 2–5.

- [ ] Read root/web AGENTS and linked project rules; verify current HEAD and dirty files.
- [ ] Inspect installed toolchains and available licensed sample exports. Obtain reproducible minimal Unity/Godot web exports without introducing a runtime dependency or committing unlicensed binaries. Record engine version, export settings, asset list and fixture SHA-256. If Unity tooling/export is unavailable, record that as an explicit compatibility blocker.
- [ ] Inspect MIME/CSP/CORS/capability expiry and relative URL behavior against each export. Run a disposable browser compatibility probe; do not alter production headers.
- [ ] Record whether fetch/WASM/workers/keyboard/touch/rendering work under the existing opaque sandbox. Record the exact reason for each failure, including unavailable Chromium.
- [ ] Commit the report with fixture provenance. Unverified compatibility remains unverified, even if later tasks can proceed independently.

### Task 2: Bounded 100 MiB ZIP ingestion

**Files:** modify `apps/api/src/games/game-content.service.ts`, `game-content.controller.ts`, relevant archive/storage code only if memory evidence requires streaming; test `game-content.service.spec.ts`, `apps/api/src/game-artifacts/artifact-storage.spec.ts`; synchronize `compose.production.yml`, `deploy/Caddyfile` and safe example configuration where applicable.

**Consumes:** existing `MAX_UPLOAD_BYTES` / `uploadLimitFromEnvironment`. **Produces:** the same upload API with the new exact limits and bounded processing.

- [ ] Search configuration references before editing:

```sh
rg -n '26214400|25 MiB|100 MiB|1,000|GAME_UPLOAD_MAX_BYTES|MAX_ENTRIES|MAX_EXPANDED_BYTES' apps packages deploy compose.production.yml .env.example .env.production.example docs
```

- [ ] Add policy regression assertions to the existing production-limit suite:

```ts
expect(uploadLimitFromEnvironment(undefined)).toBe(104857600);
expect(uploadLimitFromEnvironment('104857600')).toBe(104857600);
expect(() => uploadLimitFromEnvironment('104857601')).toThrow();
```

- [ ] Add fixture tests for compressed size exactly at/over limit, actual expanded bytes at/over limit, and 2,000/2,001 entries. Retain traversal, symlink, duplicate, encryption, missing-root, unauthorized-owner and previous-artifact retention assertions. Avoid constructing several 400 MiB buffers concurrently; isolate large boundary tests or exercise streaming byte accounting.
- [ ] Run the focused suite and capture expected RED before modifying policy:

```sh
pnpm --filter api exec vitest run src/games/game-content.service.spec.ts
```

- [ ] Set the policy constants to `100 * 1024 * 1024`, `400 * 1024 * 1024`, `2000`; keep middleware tied to the authoritative policy. Update fixed environment validation and deployment example together.
- [ ] Measure peak memory with the maximum permitted fixture and concurrent requests. If current buffering exceeds the service budget, stage extraction using bounded streams and temporary-file cleanup before enabling the larger limit. Test cancellation/storage-failure cleanup and atomic installation; do not implement a second publication path.
- [ ] Run service/storage tests, API typecheck, and configuration diff review. Commit `feat(upload): support bounded 100 MiB game archives`.

### Task 3: Web export assets and capability delivery

**Files:** `apps/api/src/games/game-content.service.ts`, `game-content.controller.ts`, their existing tests; `apps/api/src/game-artifacts/artifact-storage.ts` only if delivery requires it.

**Consumes:** accepted ZIP file list and existing artifact metadata. **Produces:** tested static web asset delivery without changing UPLOAD contracts.

- [ ] Add fixtures containing root HTML and `.wasm`, `.data`, `.pck`, `.bin`, `.glb`, `.gltf`. Assert exact bytes and the MIME types in the spec after installation and capability retrieval; the current extension policy should fail these cases first.
- [ ] Extend the existing MIME mapping with these exact values:

```ts
'.wasm': 'application/wasm',
'.data': 'application/octet-stream',
'.pck': 'application/octet-stream',
'.bin': 'application/octet-stream',
'.glb': 'model/gltf-binary',
'.gltf': 'model/gltf+json',
```

- [ ] Reject detected unsupported precompressed engine payloads with export-setting guidance. Keep unknown/native extensions rejected; test no installation on rejection.
- [ ] Use Task 1 fixtures to test relative fetches and WASM within the current sandbox. Any narrowly scoped WASM CSP change needs its own RED browser reproduction and security regression; never substitute broad JS eval or same-origin privileges.
- [ ] Test stale/expired capability denial and old artifact preservation alongside new file support. Commit `feat(upload): serve validated web engine assets`.

### Task 4: Upload-first UI and export guidance

**Files:** `apps/web/components/game-creation-paths.tsx`, `upload-editor.tsx`, `apps/web/lib/api-error-message.ts`, `apps/web/tests/studio-page.test.tsx`, `forms.test.tsx`, `api-error-message.test.ts`; create `docs/04-workflows/web-game-upload.md`.

**Consumes:** Tasks 2–3 policy/errors. **Produces:** upload-first creation and accurate export instructions, with no new API field.

- [ ] Add behavior tests for upload-first ordering, unchanged Pixel entry, and guidance choices HTML5/Unity/Godot. Assert selected guidance does not change the multipart `game` contract or silently publish.
- [ ] Capture focused RED, then make the minimal component changes. Show 100 MiB/400 MiB/2,000-entry limits, unsupported export settings and preview action. Preserve filename/pending/error/retry; no fake percentage.
- [ ] Implement bounded literal HTML/CSS reference diagnostics only if they improve actionable packaging errors. Test query/hash normalization, parent-relative containment, missing local assets and data/blob exclusions. Dynamically constructed JS URLs remain a preview verification concern; do not execute uploaded code during analysis.
- [ ] Explain root ZIP structure, single-thread/uncompressed settings, native-file exclusion and limitations in the guide. Only mark engine versions supported when Task 1/5 proves them.
- [ ] Run:

```sh
pnpm --filter web exec vitest run tests/studio-page.test.tsx tests/forms.test.tsx tests/api-error-message.test.ts
pnpm --filter web typecheck
```

- [ ] Commit `feat(web): prioritize web game uploads and export guidance`.

### Task 5: Real upload acceptance and handoff

**Files:** extend `apps/web/e2e/lean-upload.spec.ts` and `creation-paths.spec.ts`; add `apps/web/e2e/web-engine-upload.spec.ts`; update the Task 1 report and upload guide.

**Consumes:** actual engine exports, real disposable API/PostgreSQL/storage, installed browser. **Produces:** versioned compatibility evidence and release decision.

- [ ] Exercise each real Unity/Godot fixture through upload UI, preview, reload, submit, independent moderator approval and public play. Assert actual render/input progress, successful WASM/data requests and no missing assets. Do not replace the uploaded game with mocked HTML or compile it in the test.
- [ ] Include keyboard and actual touch input, old-version invalidation, unauthorized replacement and failed replacement preserving the working version.
- [ ] Run 390px/1280px layout assertions. Record browser/device, engine version/settings, package sizes, time to first playable frame and peak upload memory; do not invent a universal FPS guarantee.
- [ ] Run focused API/web tests followed by `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the new browser suites. Record every command and exit status; distinguish existing failures and skips from success.
- [ ] Review final diff; update the report with supported configurations and remaining blockers. Commit `test(upload): verify web engine publication journeys` only for real tested results, or label a partial checkpoint explicitly if environment blocks execution.
- [ ] Keep production deployment and merging the older branch dependency chain separate from this documentation/implementation task.

## Plan self-review

Coverage: package limits/resources → Task 2; formats/sandbox → Tasks 1/3; priority/guidance/diagnostics → Task 4; actual export compatibility, publication, browser input, layout and resource evidence → Task 5. No new source type, preset persistence or database schema is required. This plan does not complete the older Pixel Studio Task 5.
