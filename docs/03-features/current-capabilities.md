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
