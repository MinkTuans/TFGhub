# TFG Pixel Studio remaster

Status: approved for autonomous execution by the user's explicit instruction to decide through completion without further questions.

## Outcome
A Vietnamese beginner can create a playable 2D pixel game, understand what to do next, import artwork/audio and JavaScript, edit a scene, run it, save/reload, build and submit. A complete editable pixel adventure demonstrates the same ENGINE workflow. Detailed instruction is present inside Studio, on a public documentation page, in repository docs, and in the existing admin document library.

## Findings
ENGINE currently only edits scene documents. Asset upload is buried in the hierarchy; scripts have a schema but no UI or mutations. ENGINE bypasses legacy GameWorkspace's build/publish UI and cannot build at all. Canonical revision edits do not invalidate artifact/review state. These are functionality gaps as well as design problems.

## Product design
- Start screen: named project, cards for a playable Pixel Adventure template (recommended/default UI choice) or Blank 2D project. No unexplained component picker on first entry.
- Persistent workspace tasks: Bắt đầu, Thiết kế, Tài nguyên, Code, Chơi thử & xuất bản, Hướng dẫn. Save state and undo/redo remain visible. Existing canvas and selection persist across panels.
- Beginner overview gives ordered, actionable steps and explains scene/object/artwork/behavior. Scene workspace exposes common object presets with readable labels; raw schema/component controls are advanced and collapsed by default.
- Dedicated assets screen puts Nhập ảnh / âm thanh first, supported types/limits nearby; reuse the existing upload, ownership, immutable bytes and placement flow. Support project JSON export/import and .js script import separately with clear labels.
- Code screen offers named scripts, source editing, scene attachment, save/errors and working API examples. Scripts are real canonical document resources, never external hidden storage.
- Play/build/publish screen gates operations on acknowledged save state, builds the canonical revision, shows sandboxed preview and errors, lets the owner enter public metadata and submit through existing moderation. Never claims a stale artifact contains new edits.
- Mobile can navigate tasks, import/edit code and preview; responsive panel switching must not merely hide the editor with a desktop-only message. Canvas editing on desktop remains the recommended precision workflow.

## Engine and sample
Implement a general top-down V2 engine runtime, not a CODE game wrapper. Core movement, solids/triggers, pickups, health, score, event conditions/actions, restart and win/lose are driven by scene/component/event data. Keyboard and touch controls. Render imported sprites with pixel smoothing off and support built-in pixel art so a new template is playable immediately. Built-in art uses reserved SpriteRenderer.frame names with null assetId; imported assets always win when present. Include useful terrain, hero, crystal, hazard and gate sprites with a coherent palette.

Game: Đảo Đom Đóm — collect crystals around a small island garden, avoid hazards, unlock the lighthouse exit. Win and lose/retry are genuine game states. Actors, obstacles, collectible events and a documented customization script are editable in Studio. No gameplay keyed to a game ID, title or slug. Publish a sample through the same build and moderation lifecycle and leave the user's existing games untouched.

## Interfaces
- core export `createPixelAdventure(projectId: string, newId: () => string): EngineProjectV2`; exports `BUILTIN_PIXEL_SPRITES` and sprite drawing helper/data for editor/runtime.
- core export `compileEngineHtml(project: EngineProjectV2, assets: Record<string,string>): string`; serializes a validated snapshot and a self-contained browser runtime. Creator source is data on server, executed only in a sandboxed game context. Runtime diagnostics must be visible, bounded and not expose host secrets.
- canonical mutations: `script.upsert {script}`, `script.delete {scriptId}`, `project.settings {settings}`, `project.replace {project}`. Replacement must preserve projectId; inverses restore exact prior state; final V2 validation and repository asset ownership remain mandatory.
- creation contract gains optional `template: 'BLANK' | 'PIXEL_ADVENTURE'`, default BLANK for existing API consumers. UI selects pixel template initially.
- ENGINE `/games/:id/build` reads owned canonical head, copies hash-verified referenced bytes to artifact-relative files, uses the core compiler, and finalizes with existing optimistic Game.updatedAt guard. New canonical revision commits atomically invalidate artifactReady/review/visibility and advance Game.updatedAt; receipt replays do not invalidate again. Retain immutable source revision/build provenance.
- `/huong-dan` public read-only guide, shared content/component with Studio. Repository guide `docs/04-workflows/pixel-studio-guide.md`; import only this new document to admin library without reseeding or replacing unrelated admin edits.

## Constraints
Preserve all existing game sources, editor history/recovery, owned asset validation, stable IDs, immutable artifacts, same-origin request protection and iframe sandbox without allow-same-origin. No new dependencies unless verified necessary. Do not run creator scripts in API/editor parent. Do not invent hidden production accounts, edit existing game source, publish existing drafts or modify database schema unless necessary. Existing isolated deploy-ip-preview worktree is clean and reused. User authorizes this redesign, demonstration game creation, docs and deployment; routine design decisions do not require confirmation.

## Acceptance
1. Create template from UI, play immediately after build; all template data survives reload.
2. Upload a small PNG, place it, move it, undo/redo, save/reload and see it in runtime; WAV upload available.
3. Import/edit JS, save/reload and observe a documented effect during gameplay; syntax/runtime errors appear in preview; stop/restart recovers.
4. Export/import validated project JSON; malformed data rejected, foreign asset references rejected, project identity preserved.
5. Complete and lose/restart the sample; keyboard and touch work; editing a speed/obstacle changes actual play.
6. New revisions invalidate old builds; concurrent edits cannot finalize a stale build; duplicates preserve idempotency.
7. Guide is reachable from editor and public navigation and exists in admin docs.
8. Test unit/contracts/API/browser paths, visual desktop/mobile/light/dark, production builds and deployed health. Production browser probes do not fabricate engagement activity.

## Scope boundaries
This release is a usable top-down 2D pixel authoring engine, not 3D or a universal implementation of every pre-existing component kind. Unsupported runtime features must be diagnosed honestly. Prior mobile player and header fixes remain intact.
