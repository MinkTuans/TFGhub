# Current capabilities

| Area | Implemented | Boundary |
| --- | --- | --- |
| Accounts | Registration, sessions, current user, developer profile | Cookie session only |
| Catalog | Drafts, discovery, slug lookup, related games | Public reads require approved/public content |
| Legacy authoring | ZIP, code, story, platformer | Uses `Game.projectData` and artifact versions |
| Publishing | Build/upload, preview, review, public play | Implemented for legacy artifacts |
| Covers | Versioned JPEG/PNG/WebP | Separate from ENGINE assets |
| ENGINE | V1/V2 read, materialization, revisions, mutations | Revision document is canonical |
| Studio | Scenes, objects, history, recovery, Canvas2D, hierarchy, inspector | Preview is not full runtime |
| Assets | Validation, thumbnail, list, rename, tombstone, retained reads | GC has no production scheduler |
| Deployment | Compose, Caddy, migrations, backup/restore | `/health` is liveness only |

Not implemented: complete ENGINE build/release/runtime, production asset-GC scheduling, malware scanning, analytics, donations, or a generative-AI integration. Database tables and historical plans alone do not make a feature delivered.

## Administrator information and documents

ADMIN accounts have a separate “Quản trị website” entry leading to `/admin/library`.
They can create, read, edit and delete document categories and Markdown documents,
search title/content, read formatted tables/code, and follow imported document
links. Empty categories may be deleted; documents must first be moved or removed.
Concurrent stale saves/deletes are rejected with a version conflict. Guest, USER
and MODERATOR sessions cannot access these records. Library edits persist in
PostgreSQL and do not change executable source files or application configuration.

The administrator documentation library displays six documents per page with equal-size cards and a horizontally scrollable category rail. On phones, document cards form two columns and the reader opens below the list.
