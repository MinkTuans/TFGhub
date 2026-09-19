# Upload game indie web 100 MiB

Status: approved direction, implementation pending. This document does not claim Unity/Godot compatibility has been delivered.

## Outcome

Prioritize the upload option on the creation page. A creator uploads an already-built 2D or 3D web game, previews it, reloads the workspace, submits for moderation, and shares its approved playable page. Pixel Studio remains available. Native executables and engine source projects are outside this release.

## Package contract

- Exactly one ZIP in the existing multipart field `game`, with root `index.html` and relative packaged assets.
- Maximum compressed size: 100 MiB (104857600 bytes).
- Maximum actual expanded size: 400 MiB (419430400 bytes).
- Maximum archive entries: 2,000, including directories. Counting directories prevents an unlimited metadata-only archive.
- Retain path containment, duplicate/path-conflict, symlink, encryption, ownership and extension validation. Reject before installation; failure preserves the previous playable artifact and moderation state.
- No server-side build, dependency installation, creator-code execution, executable hosting or source conversion.

## Export compatibility

Three UI guidance choices: generic HTML5, Unity WebGL, Godot Web. These are packaging instructions, not new game source types or a promise that every engine version works.

Start with uncompressed, single-threaded web exports. Unity/Godot versions and exact export settings must be recorded alongside real fixture evidence before either preset is described as supported. Multithreaded/SharedArrayBuffer builds, browser persistence requiring same-origin privileges, and engine-compressed `.br`, `.gz`, `.unityweb` payloads are outside initial acceptance. Return actionable repackaging guidance for detected unsupported packaging. Browser ZIP compression remains supported.

Extend the current static-file allowlist for tested web assets: `.wasm` as `application/wasm`; `.data`, `.pck`, `.bin` as `application/octet-stream`; `.glb` as `model/gltf-binary`; `.gltf` as `model/gltf+json`. Add further formats only when an actual export fixture needs them and its delivery policy has tests. Never allow arbitrary extensions merely because an engine preset was selected.

Preserve the opaque game iframe and existing capability access. Do not add `allow-same-origin`, broad network access, or unrestricted JavaScript evaluation. If WebAssembly needs a narrowly scoped CSP directive, validate it in a standalone compatibility experiment and document the exact policy delta and regression tests. If an export cannot run within the approved boundary, label that configuration unsupported rather than weakening isolation.

## Validation and delivery

Reuse upload → immutable artifact → owner preview → moderation → public capability delivery. No database migration or persistent preset field is necessary. Preserve readiness/version invalidation and old artifact retention.

Static diagnostics may detect literal missing local URLs in HTML/CSS and known export-loader filenames. Normalize query/hash and relative paths before checking; data/blob URLs are not package files. Do not execute JavaScript or fetch remote URLs during validation. Arbitrary dynamically constructed JS URLs cannot be proven complete statically: present diagnostics as partial checks and verify requests in the real preview. External resources remain subject to the existing runtime network policy; do not promise exhaustive detection of every external reference.

Coordinate the 100 MiB file limit across multipart middleware, API policy, gateway, deployment examples and Vietnamese messages. Allow bounded multipart overhead at the gateway. Do not raise cover/ENGINE asset limits by accident.

400 MiB expansion is a ceiling, not a preload target. Inspect memory usage: the current reader buffers expanded files. Before enabling the higher limit, either demonstrate safe bounded peak memory/concurrency on the intended service budget or stage ZIP extraction to temporary files with bounded streaming and cleanup. Reuse immutable artifact installation and rollback behavior. Record upload concurrency policy and measured peak memory in release evidence.

Do not promise automatic game optimization. Provide guidance to reduce textures/audio and preload only needed assets; measure first playable frame, transfer size and memory for sample builds on named devices. Large-package warnings are informational, not fabricated FPS guarantees.

## Interface

Put “Tải game lên” first; retain “Tạo game Pixel”. Upload form offers export guidance, exact limits, filename, pending state, actionable errors/retry and link to preview. Never display a fake progress percentage. A successful upload is separate from successful playback and moderation approval.

## Acceptance

1. Boundary and hostile ZIP tests pass, including failed replacement preserving the old version.
2. Real minimal Unity and Godot exports load their WASM/data through capability URLs in the sandbox, render a 3D scene and respond to keyboard/touch on specified supported browsers.
3. For each fixture, upload → preview → reload → submit → approve → anonymous public play succeeds using disposable accounts/database/storage.
4. Stranger replacement, expired/stale capability and forbidden resource requests remain denied.
5. Creation/upload works at 390px and 1280px without horizontal overflow.
6. Exact export versions/settings, browser results and resource measurements are recorded. Missing browsers or skipped tests mean acceptance is pending.

## Delivery boundaries

Commit each tested task separately on the existing implementation branch. Main lacks the implementation dependency chain; do not cherry-pick feature commits into it in isolation. This design does not authorize production deployment. The older lean engine Task 5 remains incomplete until its separate real-browser acceptance passes.
