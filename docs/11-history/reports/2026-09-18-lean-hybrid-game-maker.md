# Lean hybrid game maker — Task 1 baseline

**Recorded:** 2026-09-18 UTC

**Branch/head:** `deploy/ip-preview` at `bd6a3c45642dd5cd69a24a4b10d81dcf208d80ea` (`origin/deploy/ip-preview` resolves to the same commit)
**Published deployment:** not inspected or mutated.  This is repository/test evidence, not evidence of a live deployment.

## Scope and worktree state

The branch contains prior engine/studio work.  The audit did not change application code.

At start and after the checks, the pre-existing Task 2 modifications were exactly:

- `apps/web/components/upload-editor.tsx`
- `apps/web/tests/forms.test.tsx`

Their combined `git diff` SHA-256 was unchanged:
`579d1c11f26f0a22598014185460130b44e541eaa11c565ebf047d96a2341f8e`.
An untracked planning document, `docs/superpowers/plans/2026-09-18-lean-hybrid-game-maker-sol.md`, was also present and left untouched. `git diff --check` produced no output.

`gh` is not installed in this environment, so a hosted PR record could not be queried. The checked-out branch tracks `origin/deploy/ip-preview` at the head above.

## Fresh focused check invocation

The following requested sequence was invoked once, serially, on this worktree; the contracts build first rebuilt engine-core and no competing shared `dist` build was started:

```bash
pnpm --filter @indieforge/contracts build
pnpm --filter @indieforge/engine-core exec vitest run src/runtime/game-runtime.test.ts src/runtime/engine-html.test.ts src/templates/pixel-adventure.test.ts
pnpm --filter web exec vitest run tests/studio-shell.test.tsx tests/pixel-studio-guide.test.tsx
```

Observed fresh output confirmed the contracts command and its engine-core prerequisite build ran. The engine-core Vitest process completed and the chained web Vitest process began and then exited. The terminal handoff returned only the build output before retaining the chained process, so it did **not** provide the final Vitest summaries or final exit code to this audit. Do not convert old PASS claims into a fresh PASS claim from that incomplete capture. Fresh build artifacts have timestamps around `2026-09-18T08:26–08:27Z`.

No browser/E2E command was run in Task 1. Existing Playwright files are source evidence only, not fresh browser acceptance evidence.

## Capability matrix

| Capability | Authorable | Persisted | Runtime-supported | Browser-tested |
| --- | --- | --- | --- | --- |
| HTML5 ZIP upload with root `index.html` and relative files | Yes — `UploadEditor` posts `game` ZIP; UI states root entry and 25 MiB compressed limit | Yes — API validates ZIP then installs a new immutable artifact version; owner/moderation checks remain in service | Yes — scoped preview/play serves immutable artifact files in restricted iframe sandbox | Existing (not rerun): `account-game-flow.spec.ts` has upload → retry → preview → submit coverage; no fresh browser result |
| ENGINE creation from Pixel Adventure or blank project | Yes — creation form offers `PIXEL_ADVENTURE` and `BLANK` | Yes — API creates game/project/revision and V2 mutation model provides immutable canonical revisions | Yes — template compiles to browser HTML/runtime | No fresh browser proof of either creation path |
| Pixel scene/object editing, undo/recovery and asset/script authoring | Yes — Studio task panels and object commands | Yes — canonical mutation batches, stable IDs and revision receipts | Partly — renderer/runtime consumes supported V2 components; unsupported configurations diagnose | Existing focused component tests only; no fresh browser result |
| Collectible, rectangular collision, health, score, win/loss/restart | Partly — visual panel creates one new basic rule and template is editable | Yes — `event.upsert` canonical mutation and template V2 document | Yes — focused runtime/template tests target collection-once, blocking, hazards, score gate, win/loss/restart, pause and bounded diagnostics | No fresh browser proof of keyboard/touch play through an edited game |
| Safe scripts and runtime diagnostics | Yes — Studio code panel stores scene-attached scripts and declared capabilities | Yes — `script.upsert` mutation | Yes — compiled game uses a Worker, capability-scoped commands and bounds | No fresh browser proof of saved script execution/error display |
| ENGINE build, preview invalidation and publish workflow | Yes — Studio build/submit controls | Yes — build records pin revision/asset provenance; edits invalidate readiness | Yes — compiler emits playable HTML, artifact storage seals immutable versions | Existing Studio component test covers saved-head build and preview invalidation; no fresh browser publish journey |

## Bounded P0 defects / missing acceptance evidence

1. **Visual rule editing is incomplete.** `VisualGameplayPanel` only creates a new rule, toggles it, or deletes it. It does not edit an existing rule, author a score condition, or compose/reorder multiple actions. This blocks the specified no-code “change collectible count and win score” journey.
2. **Rule target selection is not scene/compatibility scoped.** The panel flattens objects across all scenes and presents them for collision/collect/enter selections. It does not reset stale selections when trigger/scene changes, nor restrict targets to compatible objects. This risks invalid cross-scene rules and fails the stated target-selection requirement.
3. **P0 browser journeys are absent as named acceptance tests.** There are no `lean-upload.spec.ts` or `lean-pixel-maker.spec.ts` files. Existing browser coverage includes a legacy HTML5 upload journey, but Task 1 did not run it and no browser scenario proves template → PNG → edited rule → save/reload → sandboxed keyboard/touch win/loss/restart.
4. **Upload interaction evidence is incomplete for the reduced release.** The current component has pending/error state and packaging hints, but no upload progress or explicit successful-preview state. The pre-existing Task 2 changes are deliberately not assessed or altered here; Task 2 should add regression fixtures for rejected archives/replacements and browser proof.
5. **The guide is not validated against the exact release journey.** Its single focused test checks search/navigation, while the guide instructs workflows (including manual JSON event editing) beyond what the visual rule UI currently supports. It requires Task 6 alignment after the real browser flow is proven.

## Constraints retained

The inspected implementation retains legacy `UPLOAD`, `CODE`, `STORY`, and `PLATFORMER` workspace routing, owner/moderator authorization at the API boundary, canonical immutable revisions and artifact provenance, sealed artifact storage, and iframe sandbox `allow-scripts allow-pointer-lock` (without `allow-same-origin`).

## Next task

Task 2 may proceed against the untouched upload-editor/forms working changes, beginning with its archive/replacement regression fixtures. It must obtain its own fresh focused test and browser evidence; this baseline is not a release approval.
