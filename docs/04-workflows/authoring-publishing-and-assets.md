# Authoring, publishing, and asset workflows

## Legacy lifecycle

The new-game page offers two first steps: **Tạo game Pixel** opens the ENGINE template form, while **Tải game HTML5/ZIP** opens the existing legacy draft form with UPLOAD selected. The latter retains CODE, STORY, and PLATFORMER options; after creating the draft, open it from Studio to upload the ZIP. ZIP input requires a root `index.html` and is limited to 25 MiB compressed.

An authenticated creator creates a draft, saves project data or uploads an HTML5 ZIP, generates an immutable artifact, previews through a scoped capability, and submits it. A moderator/admin approves or rejects it. Approved public games appear in discovery and play through sandboxed delivery. Relevant source changes reset readiness/review state.

## ENGINE lifecycle

Creating an ENGINE game atomically creates the Game, EngineProject, and first revision. Studio loads that revision; validated typed mutations create immutable result revisions. Conflicts are surfaced for explicit discard/reapply rather than silent overwrite. Choose the pixel adventure template or a blank project; use the task tabs to import assets, write JavaScript, design scenes and build a playable artifact. The existing submit/moderation workflow publishes ENGINE games. See the [detailed Vietnamese tutorial](pixel-studio-guide.md), also available publicly at `/huong-dan` and inside Studio. Editing a canonical revision invalidates the previous artifact until rebuilt.

For an empty selected scene, Studio's start panel offers **Thêm nhân vật**, **Nhập ảnh**, and **Mở hướng dẫn**. These create the existing player preset and open the existing asset and tutorial panels. Adding a player requires an editable project and a visible, unlocked World layer.

## Project assets

The owner uploads through `/games/:id/assets`. Authorization is checked before multipart processing. Image metadata, magic bytes, dimensions, pixel count, and size are validated; Sharp creates a deterministic thumbnail without modifying source bytes. Studio references stable IDs, not storage URLs. Deletion tombstones an asset while retained revisions can still resolve referenced immutable content.

See [API](../05-api/README.md) and [database](../06-database/schema-and-migrations.md).
