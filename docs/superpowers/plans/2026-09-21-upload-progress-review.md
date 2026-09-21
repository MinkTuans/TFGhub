# Upload Progress and Replacement Clarity Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. Steps use checkbox syntax for tracking. The user approved the design and declined a new worktree; execute on the current branch without another approval round for routine implementation.

**Goal:** Show genuine upload progress and explain replacement/review behavior in the existing HTML5 upload workflow.

**Architecture:** A dedicated XMLHttpRequest helper sends the existing multipart upload and reports transfer events. UploadEditor handles selection, transfer and server-processing states; GameWorkspace supplies the previous artifact version. Existing API validation and immutable installation stay authoritative.

**Tech Stack:** React, TypeScript, XMLHttpRequest, Vitest/Testing Library, Playwright, existing Nest API.

**Spec:** `docs/superpowers/specs/2026-09-21-upload-progress-review-design.md`

## Global constraints

- Applies only to `POST /games/:id/upload` and the `UploadEditor` for `UPLOAD` games.
- The upload remains one `game` form-data file, with the existing 100 MiB compressed, 400 MiB expanded, and 2,000-entry limits.
- The API remains the authority for owner checks, ZIP parsing, staged installation, immutable artifact versioning, and review-state reset.
- No resumable upload, background transfer, client-side archive inspection, direct-to-storage upload, new file formats, engine detection, or security-policy change is included.
- A progress bar must never invent a percentage. It is determinate only after receiving a browser `ProgressEvent` with `lengthComputable === true`; otherwise it remains indeterminate with an accessible status message.
- No new dependency. Preserve API/schema/CSP/sandbox and credentials behavior.
- Do not push, merge or deploy as part of this implementation.

## Workspace and evidence

Current branch: `feature/upload-progress-review`, based on `21d9a20`; spec commit: `f296814`. The existing `.worktrees/deploy-ip-preview` has unrelated uncommitted E2E edits. Do not edit or copy those changes.

Before implementation, check `git status --short` and read the installed Next client-component guide required by `apps/web/AGENTS.md`. Build contracts once with `pnpm --filter @indieforge/contracts build`. Run the existing focused forms/API-client tests as a baseline. Record failures separately from new regressions.

## Task 1: Dedicated upload transport

**Files:** Create `apps/web/lib/game-upload.ts`, `apps/web/tests/game-upload.test.ts`, and a small reusable XHR test double in `apps/web/tests/helpers/upload-xhr.ts`.

**Consumes:** `ApiError`, `resolvePublicApiBaseUrl` from `apps/web/lib/api-client.ts`; `GameSummary` from contracts.

**Produces:**

```ts
export type UploadCallbacks = {
  onProgress: (progress: { loaded: number; total: number }) => void;
  onIndeterminate: () => void;
  onTransferred: () => void;
};
export function uploadGame(
  gameId: string, archive: File, callbacks: UploadCallbacks,
): Promise<GameSummary>;
```

- [ ] Write failing transport tests using a controllable XMLHttpRequest double. Capture URL, credentials and FormData; dispatch actual ProgressEvent objects on its upload EventTarget. Assert callback outputs and promise resolution/rejection rather than only method-call counts.

```ts
const onProgress = vi.fn();
const completion = uploadGame("game-1", file, {
  onProgress, onIndeterminate: vi.fn(), onTransferred: vi.fn(),
});
xhr.upload.dispatchEvent(new ProgressEvent("progress", {
  lengthComputable: true, loaded: 1024, total: 2048,
}));
expect(onProgress).toHaveBeenCalledWith({ loaded: 1024, total: 2048 });
// The double exposes respond(status, body), which dispatches load.
xhr.respond(201, JSON.stringify(readyGame));
await expect(completion).resolves.toEqual(readyGame);
```

`file` is a nonempty ZIP File; `readyGame` is an existing valid GameSummary test fixture with artifactReady true. The helper double must expose the real boundary: upload EventTarget, responseText/status, open/send, event handlers and captured request body. Restore the global constructor after each test.

- [ ] Run `pnpm --filter web exec vitest run tests/game-upload.test.ts`; record the missing-helper failure.
- [ ] Implement the helper: encoded game ID, public API base, POST, withCredentials true, one `game` FormData entry, no manual Content-Type. Register upload listeners before sending. Treat zero/invalid totals or noncomputable events as indeterminate. `upload.load` reports transfer completion only; response `load` decides success.
- [ ] Parse HTTP error JSON string/array messages like the existing client; retain HTTP status with a fallback message for non-JSON responses. Reject malformed success JSON and network/abort/timeout events. Do not add an arbitrary short timeout that breaks 100 MiB transfers.
- [ ] Cover relative `/api` and absolute configured API bases, multipart boundary ownership, noncomputable events, HTTP 400/413/503, network failure, malformed JSON, and transfer-complete-before-response. Run the focused test until green.
- [ ] Commit only the helper and its tests after `git diff --check`.

## Task 2: Editor progress and replacement copy

**Files:** Modify `apps/web/components/upload-editor.tsx`, `apps/web/components/game-workspace.tsx`, and upload cases in `apps/web/tests/forms.test.tsx`; add focused tests in `apps/web/tests/upload-editor.test.tsx`.

**Consumes:** `uploadGame` from Task 1; workspace `game.artifactVersion`.

**Produces:** `UploadEditor` adds optional `artifactVersion?: number` (default zero); GameWorkspace passes its current version. Preserve `gameId` and `onUploaded` props.

- [ ] Write failing component tests with the real helper and Task 1's XHR boundary double. Migrate the two existing upload tests that stub fetch; keep unrelated forms tests unchanged.

```tsx
render(<UploadEditor gameId="game-1" artifactVersion={2} onUploaded={onUploaded} />);
fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
  target: { files: [new File(["zip"], "replacement.zip")] },
});
fireEvent.click(screen.getByRole("button", { name: "Tải trò chơi lên" }));
xhr.upload.dispatchEvent(new ProgressEvent("progress", {
  lengthComputable: true, loaded: 1048576, total: 2097152,
}));
expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1048576");
expect(screen.getByRole("progressbar")).toHaveAttribute("max", "2097152");
```

- [ ] Run `pnpm --filter web exec vitest run tests/upload-editor.test.tsx tests/forms.test.tsx`; verify failures describe the missing behavior.
- [ ] Display selected filename and size. Reject empty files, wrong suffix (case-insensitive `.zip`) and files over 100 MiB before a request; leave archive-content validation to the server. Clear stale status when selection changes.
- [ ] Disable file selection and submit during the request and guard duplicate submit. Capture whether this attempt replaces a prior artifact before awaiting the response; a parent update must not turn an initial success into a replacement notice.
- [ ] Render genuine progress with floored percentage so rounding cannot show 100% early. Label reported MiB as transferred request bytes: XHR includes multipart overhead and is not an exact file-only count. Use the selected File.size for pre-upload file size only.
- [ ] After upload.load show `Đã gửi tệp. Đang chờ máy chủ kiểm tra…`; 100% transferred is not accepted/ready. Keep the action disabled until the response resolves. Use indeterminate progress while waiting for server validation.
- [ ] Preserve the existing success message only after a ready response. For replacements additionally explain that the new version is Draft and must be submitted/approved again. Explain this consequence before submitting a replacement too. A not-ready response must not claim preview readiness.
- [ ] Failure retains the selected file and existing workspace artifact. Retry resets progress/error. Test that rejected replacement leaves the previous preview unchanged and that the next successful attempt updates it.
- [ ] Run focused helper/editor/forms tests, `pnpm --filter web typecheck`, and ESLint on changed files. Commit the UI and tests after reviewing the diff.

## Task 3: Browser lifecycle and regression evidence

**Files:** Extend `apps/web/e2e/lean-upload.spec.ts`; change `apps/web/e2e/api-harness.mjs` only if its existing contract requires a minimal correction; write `docs/11-history/reports/2026-09-21-upload-progress-review.md`.

**Consumes:** Existing registration/moderator flow, ZIP fixtures and real upload endpoint; updated editor from Task 2.

**Produces:** Browser assertions for rejected owner replacement, successful owner replacement, re-review and continued authorization.

- [ ] Extend the relative-asset ZIP journey: after approval/public play, sign in as owner and submit invalid ZIP bytes. Assert inline error, unchanged preview content and unchanged artifact version/public availability.
- [ ] Upload a second valid ZIP with visibly different HTML. Assert version increments, preview contains the new marker, replacement notice appears, review state is Draft and public play is unavailable. Reload and assert the replacement remains. Submit, approve as moderator, and prove the new content is publicly playable.

```ts
await expect(page.getByTitle("Chơi thử trò chơi").contentFrame()
  .getByRole("heading", { name: "Replacement ready" })).toBeVisible();
await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();
// Public requests use an anonymous context, separate from owner/moderator cookies.
expect((await anonymous.request.get(`/api/play/${slug}/`)).status()).toBe(404);
```

Create replacement ZIP bytes using the existing test ZIP utility; keep exact user-visible headings unique. Scope status assertions to the upload region or review badge. Retain the existing stranger 403 test. Do not require intermediate percentages in a localhost browser run: tiny transfers may finish in a single event; deterministic percentage behavior is covered by transport/component tests.

- [ ] Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter web exec playwright test e2e/lean-upload.spec.ts`. No skipped required lifecycle test counts as passing.
- [ ] Run `pnpm --filter api exec vitest run src/games/game-content.service.spec.ts src/game-artifacts/artifact-storage.spec.ts` for archive/replacement/storage regressions. Use a disposable real-service stack only if separately available; never use production accounts/data for acceptance.
- [ ] Run `pnpm --filter web build` and final `git diff --check`. Re-run changed checks only if fixes were necessary.
- [ ] Record exact commands, results and limitations. Distinguish harness browser evidence from a production deployment and synthetic engine evidence from real Unity/Godot support. Include the multipart-byte and server-processing semantics.
- [ ] Commit browser tests/report and provide the final branch, commit(s), test results and remaining limitations to the user.

## Plan self-review

Spec coverage: Task 1 covers authenticated transport and byte events; Task 2 covers metadata, honest progress, response readiness, retry and replacement messaging; Task 3 covers browser lifecycle and existing API/security regressions. No production policy change or unrelated feature is required. Test helper conventions are defined in Task 1 and reused only at the browser transport boundary.
