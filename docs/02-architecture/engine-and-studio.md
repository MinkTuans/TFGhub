# Engine and Studio architecture

## Canonical authoring state

For ENGINE games, `EngineProjectRevision.document` is the source of truth. Revisions are immutable. A mutation batch declares its base revision and a stable mutation ID; the API applies it atomically, records the result, and returns the new revision. Replaying the same mutation ID is idempotent.

Legacy project data can be adapted for reading. It is not silently rewritten; materialization is explicit.

## Layer separation

- **Project data layer:** schemas, stable IDs, revisions, mutations, validation, and render models.
- **Editor layer:** selection, hit testing, gestures, history, recovery, panels, and canonical commands.
- **Runtime/render layer:** consumes a document snapshot and does not depend on Editor UI state.

Pixel Studio includes a Canvas2D editor and a generic V2 top-down pixel runtime. ENGINE builds compile the canonical head and copy owned, hash-verified assets into immutable artifacts. Scripts run in isolated workers inside the sandboxed game, with declared capabilities and execution/command bounds. Unsupported advanced component configurations emit diagnostics. Stable IDs, explicit order fields, immutable revisions, and content hashes are used instead of array position or mutable paths.

Asset metadata belongs to an EngineProject. Ready bytes are immutable and referenced by asset ID plus content hash. Tombstoning removes an asset from normal authoring lists while retained revisions may still read exact referenced bytes.

## Pixel Studio build consistency

Script upsert/delete, project settings and same-identity JSON replacement use canonical mutation batches with exact inverses. Revision writes invalidate ENGINE artifact readiness and reset review in the same transaction; idempotent retries do not invalidate again. Build installation locks Game, checks both updatedAt and canonical head revision, and atomically finalizes Game plus GameBuild provenance. GameBuild references retain source revisions and assets. The existing artifact capability and moderation workflow publishes these builds; the separate GameRelease execution model remains future work.
