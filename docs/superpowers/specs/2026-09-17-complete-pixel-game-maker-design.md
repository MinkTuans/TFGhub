# Complete Pixel Game Maker remaster

Status: approved for autonomous execution by the user's explicit instruction to make all remaining decisions and continue until complete.

## Product boundary

TFG Pixel Studio is a small, usable 2D pixel game maker. It supports a guided beginner workflow, a visual event system for intermediate creators, and scripts for advanced creators. It is not a general Unity/Godot replacement. Every visible claim must correspond to canonical project data and behavior in the shipped runtime.

## Reused foundation

Keep the V2 project schema, immutable revision/mutation history, Canvas2D editor, owned immutable asset storage, sandboxed artifact delivery, moderation, build provenance, recovery, and the generic top-down runtime already implemented. Extend these boundaries instead of creating a second editor or runtime.

## Workspace and workflow

The persistent steps are `Bắt đầu → Tài nguyên → Cảnh → Đối tượng → Gameplay → Code → Chạy thử → Tài liệu`. Each step shows its purpose, current progress, and one clear next action. The global toolbar retains project name, save state, undo/redo, current scene, Play, Pause, Stop, Restart, grid, snap, and zoom.

The scene workspace keeps hierarchy, canvas, inspector, assets, and toolbar. User-facing groups are Background, Tilemap, Player, Enemies, Items, NPC, Effects, and UI. Technical layer/component details remain accessible under “Nâng cao” with inline explanations. Empty scenes offer Player, Object, Import Asset, and Template actions.

## Three levels

- Beginner: templates, object presets, readable fields, drag/drop, component/behavior recipes, and visual gameplay rules.
- Intermediate: event triggers, conditions, ordered actions, variables, timers, animation states, and scene transitions.
- Advanced: script file tree, JavaScript editor with lightweight syntax presentation, explicit save, scene/object/event attachments, capability reference, errors and runtime console.

## Assets and pixel tooling

Retain verified PNG/JPEG/WebP/WAV upload, thumbnails, search/filter, rename/delete, pagination, ownership and hash checking. Add creator folders as project-side metadata only if the current database can support it without weakening immutable byte ownership; otherwise use category filters and clearly label them. Add sprite-sheet configuration through Animator, tile/grid settings through Tilemap and scene settings, nearest-neighbor rendering, JSON import/export, and honest format limits. Font import is accepted only if the existing content validation/runtime can safely deliver it; otherwise documentation marks it unsupported instead of presenting a dead control.

## Objects and behaviors

Presets create complete canonical objects: Player, Enemy, Collectible, NPC, Obstacle, Trigger, Text/UI, Camera, Tilemap and Effect. The friendly inspector groups Appearance, Position, Collision, Movement/AI, Health, Interaction, Animation, Audio, Camera and Advanced. Adding/removing a behavior uses existing component mutations and remains undoable.

## Visual gameplay

Build a form-based rule editor over existing `GameEventV2`, not a decorative graph. A rule consists of a named trigger, optional condition, and ordered actions. The first release exposes the runtime-supported subset: start, key, timer, collision, enter/exit area, collect and variable changed; score/variable/object/health conditions; dialogue, move, audio, variable, score, health, spawn/destroy, scene change, wait, if/else and complete game actions. Unsupported schema variants remain importable and display diagnostics but cannot be falsely advertised as editable.

Canonical mutations add event upsert/delete and project variables replacement with exact inverses. Deleting referenced IDs is rejected by final schema validation. Visual changes and JSON/script changes share one history and save pipeline.

## Runtime and play mode

Extend the current data-driven runtime with sprite-sheet animation, Tilemap rendering/collision where representable, AudioSource playback, simple AI patrol/chase, camera follow, UI/text, runtime log/event diagnostics, and supported PLAY_ANIMATION/STOP_AUDIO behavior. Play/Pause/Stop/Restart operate inside the sandbox. Runtime errors name the object/component/event where possible. Creator scripts remain isolated in bounded workers and are never executed in the API or Studio parent.

## Templates and proof game

Ship five canonical factories: Empty 2D, Platformer, Top-down, Collect Coins, and Simple Shooter. Each includes a valid scene, player movement, camera, collision, sample pixel assets and one demonstrable gameplay loop. The existing editable Đảo Đom Đóm becomes the complete proof game and gains an NPC, moving enemy, authored animation, UI score/health, audio hook and visual rules. It must be created, built, played and published through the same project API and moderation flow as user games.

## Documentation

The in-engine Documentation view and `/huong-dan` share a searchable article model with categories, sidebar, code examples and previous/next links. It contains the requested 36 topics, but each article describes only shipped behavior and calls out current limits. A “Tạo game Pixel 2D đầu tiên trong 30 phút” tutorial uses the actual controls and finishes with build, debug and export/publish.

## Quality and compatibility

Preserve legacy game sources, old V2 documents, IDs, revision idempotency, asset authorization, sandbox without same-origin, existing game data, mobile player fixes and unrelated site behavior. No new dependency unless necessary. Every new canonical operation has red/green tests. Browser acceptance covers create, scene, asset, player, collision, enemy, collectible, gameplay, play, debug, save/reload and export on desktop and mobile. Unsupported functions produce clear diagnostics rather than silent failure.

## Delivery order

1. Canonical event/variable operations and visual gameplay editor.
2. Runtime animation/tilemap/audio/AI/camera/debug support and friendly object presets.
3. Five templates and enhanced proof game.
4. Searchable 36-topic documentation and onboarding.
5. Full isolated acceptance, review, production build/backup/deploy, sample publication and live read-only verification.
