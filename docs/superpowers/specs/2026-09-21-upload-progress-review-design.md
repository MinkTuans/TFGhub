# Upload progress and replacement clarity

Status: approved for design; implementation requires review of this document.

## Outcome

Improve the existing owner-only HTML5 ZIP upload experience without changing upload validation, storage, publication authorization, artifact capability policy, CSP, iframe sandbox, or supported file formats. Creators see the selected ZIP, genuine byte-based upload progress when the browser reports it, a truthful fallback while progress is unavailable, and the consequence of replacing an already uploaded build.

## Scope and exclusions

- Applies only to `POST /games/:id/upload` and the `UploadEditor` for `UPLOAD` games.
- The upload remains one `game` form-data file, with the existing 100 MiB compressed, 400 MiB expanded, and 2,000-entry limits.
- The API remains the authority for owner checks, ZIP parsing, staged installation, immutable artifact versioning, and review-state reset.
- No resumable upload, background transfer, client-side archive inspection, direct-to-storage upload, new file formats, engine detection, or security-policy change is included.
- A progress bar must never invent a percentage. It is determinate only after receiving a browser `ProgressEvent` with `lengthComputable === true`; otherwise it remains indeterminate with an accessible status message.

## Design

### Upload transport

Keep `api.post` unchanged because Fetch does not expose request-upload progress. Add a narrowly scoped web client helper for this one multipart endpoint. It uses `XMLHttpRequest`, sends the existing `FormData` with credentials, parses successful JSON with the same response shape as `api.post`, and converts non-2xx JSON/plain-text failures to `ApiError` semantics.

The helper accepts a progress callback with `{ loaded, total }` only when the event is length-computable. It invokes a separate callback for an indeterminate transfer. It must not set a `Content-Type` header, so the browser supplies the multipart boundary. It returns a promise, rejects on timeout/network/abort using the existing generic upload error path, and does not alter global API-client behavior.

### Editor state and copy

`UploadEditor` owns a small transfer state: selected file metadata, `idle | uploading | ready | failed`, and optional `{ loaded, total }`. Selecting a non-empty file displays its name and total MiB before submission. A missing or zero-byte selection retains the existing inline error.

While uploading, the submit button is disabled. A determinate `<progress value max>` and an accessible message show rounded MiB and percentage. An indeterminate `<progress>` and accessible message say the file is being uploaded but no percentage is available. Success updates the workspace game from the API response, preserves the existing ready message, and adds a replacement notice when the prior artifact version was non-zero: the newly uploaded preview is ready, but it must be submitted and approved before it can be public. Failure preserves the selected file, displays the mapped error, and presents the retry action.

### Replacement guarantee

The server already installs a new immutable artifact version and resets `visibility`, `reviewState`, review note, and submission timestamps. This change must not reinterpret that policy. The UI only describes the already-observed result and must not imply that an old public artifact remains playable after a replacement.

## Test evidence

Focused component tests must prove:

1. File metadata renders before submission.
2. A length-computable event produces a real determinate percentage and MiB values.
3. A non-computable event keeps progress indeterminate and does not display a fabricated percentage.
4. Success updates the workspace and differentiates an initial upload from a replacement requiring fresh review.
5. A rejected ZIP and network failure preserve retry behavior and do not report readiness.

Browser E2E must use the ordinary owner flow and prove initial upload → preview → reload → submit → moderator approval → public play; then owner replacement → fresh preview → re-submission requirement. It must also prove another creator receives `403` when attempting replacement. API contract tests continue to prove ZIP limits, validation, immutable installation, review reset, and owner authorization.

## Acceptance criteria

- Progress is byte-derived when available and explicitly indeterminate when unavailable.
- No success state is shown until the upload endpoint returns an accepted `GameSummary`.
- Replacement copy matches the server’s existing draft/review reset behavior.
- The existing archive, authorization, CSP, opaque iframe sandbox, MIME, and capability-token contracts are unchanged.
- Focused unit, API, and browser tests cover both initial upload and replacement without relying on a real Unity/Godot claim.
