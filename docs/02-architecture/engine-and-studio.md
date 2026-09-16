# Engine and Studio architecture

## Canonical authoring state

For ENGINE games, `EngineProjectRevision.document` is the source of truth. Revisions are immutable. A mutation batch declares its base revision and a stable mutation ID; the API applies it atomically, records the result, and returns the new revision. Replaying the same mutation ID is idempotent.

Legacy project data can be adapted for reading. It is not silently rewritten; materialization is explicit.

## Layer separation

- **Project data layer:** schemas, stable IDs, revisions, mutations, validation, and render models.
- **Editor layer:** selection, hit testing, gestures, history, recovery, panels, and canonical commands.
- **Runtime/render layer:** consumes a document snapshot and does not depend on Editor UI state.

The current Canvas2D implementation is an editor renderer, not a complete production game runtime. Stable IDs, explicit order fields, immutable revisions, and content hashes are used instead of array position or mutable paths.

Asset metadata belongs to an EngineProject. Ready bytes are immutable and referenced by asset ID plus content hash. Tombstoning removes an asset from normal authoring lists while retained revisions may still read exact referenced bytes.
