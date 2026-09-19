# Web Engine Capability Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-owned, browser-verifiable capability contract for sandboxed web runtimes without changing CSP.

**Architecture:** A pure contract module validates declared capability names. A minimal checked-in fixture declares and probes those capabilities through the existing UPLOAD → capability URL → opaque iframe flow. Browser evidence reports the current policy; it never changes policy.

**Tech Stack:** TypeScript, NestJS, Vitest, Playwright, existing ZIP fixture and game-content delivery.

**Spec:** `docs/superpowers/specs/2026-09-19-web-engine-capability-contract-design.md`

## Global Constraints

- Preserve `sandbox="allow-scripts allow-pointer-lock"`; never add `allow-same-origin`.
- Do not change `connect-src 'none'`, other CSP directives, game source types, database schema, or unrelated UI.
- No Unity/Godot binary or compatibility claim.
- Every task uses RED → GREEN, focused verification, and its own commit.

### Task 1: Pure capability contract

**Files:** Create `packages/contracts/src/web-engine-capabilities.ts`, test `packages/contracts/src/web-engine-capabilities.test.ts`, export from the package barrel.

**Produces:** `WebEngineCapability`, `WebEngineCapabilityContract`, and `validateWebEngineCapabilityContract(value)`.

- [ ] Write failing tests accepting a named, unique non-empty capability list and rejecting unknown names, duplicate names, empty names, and empty capability lists.
- [ ] Run the focused test; expect missing-module failure.
- [ ] Implement the closed union and validator with no runtime/browser dependency.
- [ ] Re-run the test and package typecheck.
- [ ] Commit `feat(contract): define web engine capability requirements`.

### Task 2: Project-owned sandbox fixture and capability characterization

**Files:** Create `apps/web/e2e/fixtures/web-engine-capabilities/`; add `apps/web/e2e/web-engine-capabilities.spec.ts`; use existing upload harness only.

**Produces:** A ZIP fixture whose DOM reports `blobUrl`, `blobWorker`, `wasm`, `capabilityFetch`, `indexedDb`, and `webSocket` states after execution in the real opaque iframe.

- [ ] Write Playwright expectations for the current sandbox and CSP plus each declared probe result; initially expect the fixture/test to be absent.
- [ ] Add a static HTML/JS fixture and minimal WASM bytes owned by the project. It must not call external services or depend on Unity/Godot.
- [ ] Upload through the existing owner flow and assert the iframe's exact DOM results, the iframe sandbox string, and response CSP.
- [ ] Record whether browser policy permits each primitive; do not adapt expected results to make a failed probe pass.
- [ ] Commit `test(web-engine): characterize sandbox capability contract`.

### Task 3: CSP decision gate and handoff

**Files:** Update `docs/11-history/reports/2026-09-19-web-game-upload.md`; create `docs/superpowers/plans/` CSP follow-up only if Task 2 proves a named runtime needs a blocked capability.

**Produces:** An auditable matrix of contract capability → actual browser result → policy reason, plus a separate CSP proposal only when justified.

- [ ] Add the named browser/version, fixture checksum, command output, and result matrix to the report.
- [ ] If `capabilityFetch` is blocked, state that current runtime compatibility remains unverified; do not edit CSP.
- [ ] If a future runtime supplies provenance and a blocked requirement, write a separate plan naming a single directive and exact capability URL scope; include security regressions for no external origins and no same-origin sandbox.
- [ ] Commit `docs: record web engine sandbox capability evidence`.
