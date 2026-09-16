# Authoring, publishing, and asset workflows

## Legacy lifecycle

An authenticated creator creates a draft, saves project data or uploads an HTML5 ZIP, generates an immutable artifact, previews through a scoped capability, and submits it. A moderator/admin approves or rejects it. Approved public games appear in discovery and play through sandboxed delivery. Relevant source changes reset readiness/review state.

## ENGINE lifecycle

Creating an ENGINE game atomically creates the Game, EngineProject, and first revision. Studio loads that revision; validated typed mutations create immutable result revisions. Conflicts are surfaced for explicit discard/reapply rather than silent overwrite. Choose the pixel adventure template or a blank project; use the task tabs to import assets, write JavaScript, design scenes and build a playable artifact. The existing submit/moderation workflow publishes ENGINE games. See the [detailed Vietnamese tutorial](pixel-studio-guide.md), also available publicly at `/huong-dan` and inside Studio. Editing a canonical revision invalidates the previous artifact until rebuilt.

## Project assets

The owner uploads through `/games/:id/assets`. Authorization is checked before multipart processing. Image metadata, magic bytes, dimensions, pixel count, and size are validated; Sharp creates a deterministic thumbnail without modifying source bytes. Studio references stable IDs, not storage URLs. Deletion tombstones an asset while retained revisions can still resolve referenced immutable content.

See [API](../05-api/README.md) and [database](../06-database/schema-and-migrations.md).
