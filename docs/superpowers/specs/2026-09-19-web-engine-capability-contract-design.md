# Web Engine Capability Contract

## Goal

Make the sandbox capabilities required by an uploaded web runtime explicit and browser-verifiable without claiming Unity or Godot compatibility or weakening the existing sandbox.

## Scope

This change adds a project-owned capability contract and a minimal web fixture. It does not add a new game source type, database schema, production CSP exception, `allow-same-origin`, engine binary, or third-party runtime dependency.

## Contract

`WebEngineCapability` is a closed union:

- `wasm`
- `capabilityFetch`
- `blobWorker`
- `indexedDb`
- `webSocket`
- `blobUrl`

`WebEngineCapabilityContract` declares a runtime name and a non-empty, duplicate-free list of required capabilities. Validation is deterministic and local; it never executes uploaded code or infers engine identity from an archive filename.

The fixture owns one contract for each isolated probe. Browser results label every capability as `available`, `blocked`, or `unsupported`; a blocked result is evidence, not a reason to widen policy.

## Current policy decision

The existing artifact CSP remains unchanged: `worker-src blob:` permits blob workers; `connect-src 'none'` blocks fetch/XHR and WebSocket; opaque sandboxing means persistent browser storage is not a supported contract. `allow-same-origin` remains absent.

If a future named runtime requires a blocked capability, it must supply a separate CSP proposal that names the directive, exact capability URL scope, expected browser evidence, and security regressions. `connect-src *`, broad origin allowlists, and automatic CSP changes are prohibited.

## Fixture and tests

The project-owned fixture is plain HTML/JavaScript plus a minimal legal WASM binary. It probes only browser primitives, renders individual results into the document, and makes no network request except the tested capability URL. Playwright tests run it through the actual upload, immutable capability delivery, and opaque iframe sandbox.

Tests must prove the current policy allows blob URL and blob Worker behavior, and blocks capability fetch, WebSocket, and persistent storage where the browser reports them unavailable. Tests also assert the exact sandbox and CSP remain unchanged.

## Compatibility and next decision

This establishes evidence for the platform boundary only. Unity/Godot remain unverified until licensed exports, version/settings provenance, and end-to-end browser evidence exist. A later CSP plan is required before adding an engine runtime that declares `capabilityFetch`.
