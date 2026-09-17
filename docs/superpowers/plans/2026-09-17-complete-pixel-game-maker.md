# Complete Pixel Game Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish TFG Pixel Studio as a small but complete 2D pixel game maker with visual gameplay, advanced scripting, five templates, real play/debug/export and searchable in-engine documentation.

**Architecture:** Extend the canonical V2 project, revision pipeline, editor and sandbox runtime already shipped in the current branch. Visual authoring writes the same typed events/components/scripts consumed by runtime and builds; no parallel project format or fake preview layer.

**Tech Stack:** TypeScript, React 19, Next 16, Nest, Zod, Prisma/PostgreSQL, Canvas2D, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-complete-pixel-game-maker-design.md`

## Global Constraints

- Do not execute creator source in API or Studio parent.
- Preserve V2/legacy compatibility, immutable revisions/assets, ownership checks and sandbox without same-origin.
- Do not expose unsupported functionality as working.
- No hard-coded behavior for a sample title, game ID or slug.
- Use focused red-green tests and keep unrelated site code untouched.

---

### Task 1: Canonical visual gameplay operations

**Files:** `packages/engine-core/src/v2/mutations.ts`, tests, exports.

- [ ] Write failing tests for event upsert/delete, exact order/inverse, referenced deletion rejection and project variable replacement.
- [ ] Add minimal schema-validated mutations and reducer/inverse handling.
- [ ] Run focused core tests/typecheck and commit.

### Task 2: Visual Gameplay and variable editor

**Files:** new focused Studio gameplay/variable panels, task navigation, CSS and UI tests.

- [ ] Write failing UI tests for rule list, trigger/condition/action authoring, reorder/delete/undo and beginner examples.
- [ ] Implement form-based editor for the explicitly supported runtime subset and display unsupported rules read-only with diagnostics.
- [ ] Add variable editor for global/player/scene typed values and exact canonical saves.
- [ ] Run focused tests/typecheck and browser-create a coin rule without JSON editing.

### Task 3: Object recipes and scene UX

**Files:** object commands/presets, hierarchy/inspector/canvas/toolbar and tests.

- [ ] Write failing tests for complete Player/Enemy/Collectible/NPC/Camera/Tilemap/UI recipes, empty-state actions and friendly grouped inspector.
- [ ] Implement readable behavior recipes, add/remove component actions, technical tooltips, multi-select/duplicate/delete controls and scene category grouping without breaking stable IDs/history.
- [ ] Verify grid/snap/zoom/layer ordering and desktop/mobile empty states.

### Task 4: Runtime animation, tilemap, audio, AI, camera and debug

**Files:** engine runtime/compiler/render model and focused tests.

- [ ] Write failing deterministic tests for Animator frames, tile draw/collision, audio start/stop state, patrol/chase AI, camera follow, UI state and structured diagnostics/logs.
- [ ] Implement the smallest data-driven runtime support for these existing V2 components/actions.
- [ ] Extend sandbox UI with Play/Pause/Stop/Restart and debug console; preserve worker capability/time/command bounds.
- [ ] Run core tests/typecheck and opaque-sandbox Chrome keyboard/touch/audio/animation probes.

### Task 5: Asset pixel workflows

**Files:** asset manager/preview/uploader, Animator/Tilemap editors, tests; API/contracts only if existing metadata cannot represent required values.

- [ ] Test upload/search/filter/thumbnail/rename/delete plus sprite sheet sizing and tile/grid configuration.
- [ ] Implement sprite-sheet preview/slicing metadata in canonical components, animation-state editing and tilemap data import where current safe JSON limits allow it.
- [ ] Keep unsupported font/folder operations clearly disabled or implement them only through existing safe asset primitives.

### Task 6: Five templates and complete proof game

**Files:** template factories/art/tests, creation contracts/UI.

- [ ] Write schema/reference/reachability/runtime tests for Empty, Platformer, Top-down, Collect Coins and Shooter.
- [ ] Implement reusable factories using V2 components/events; extend Đảo Đom Đóm with NPC, enemy, animation, UI and audio hook.
- [ ] Add template cards with plain-language goals and create each via the real API.

### Task 7: Searchable in-engine documentation

**Files:** shared documentation model/components/styles, `/huong-dan`, Studio help, repository guide and tests.

- [ ] Write tests for search, category/sidebar, 36 requested topics, code examples and previous/next navigation.
- [ ] Split current guide into accurate articles and add the exact 30-minute tutorial against shipped controls.
- [ ] Verify mobile/desktop navigation and add the same guide to admin library without overwriting unrelated documents.

### Task 8: End-to-end quality and release

- [ ] Fresh core/contracts/API/web test, typecheck, lint and production builds.
- [ ] Isolated PostgreSQL/browser flow: create template, scene, asset, player, collision, enemy, collectible, visual rule, script, play/debug, save/reload, JSON export/import and build/approve.
- [ ] Independent code/spec review and fix all material findings with regressions.
- [ ] Backup production database/storage, preserve rollback images, deploy API/web, publish the new proof game only and import the new guide only.
- [ ] Live desktop/mobile/light/dark verification, mark report `COMPLETE`, and record links plus rollback evidence.
