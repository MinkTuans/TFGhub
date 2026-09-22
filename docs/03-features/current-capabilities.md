# Current capabilities

| Area | Implemented | Boundary |
| --- | --- | --- |
| Accounts | Registration, sessions, current user, developer profile | Cookie session only |
| Catalog | Drafts, discovery, slug lookup, related games | Public reads require approved/public content |
| Legacy authoring | ZIP, code, story, platformer | Uses `Game.projectData` and artifact versions |
| Publishing | Build/upload, preview, review, public play | Implemented for legacy artifacts |
| Covers | Versioned JPEG/PNG/WebP | Separate from ENGINE assets |
| ENGINE | V1/V2 read, materialization, revisions, mutations | Canonical pixel template, runtime build and provenance |
| Studio | Scenes, objects, history, recovery, Canvas2D, hierarchy, inspector | File/code authoring, actual sandbox play, mobile task access, guide |
| Assets | Validation, thumbnail, list, rename, tombstone, retained reads | GC has no production scheduler |
| Deployment | Compose, Caddy, migrations, backup/restore | `/health` is liveness only |
| Presenter introduction | Four-slide full-screen TFG introduction for demonstrations | Client-only; opens once per browser using `tfg-demo-introduction-seen` and does not change accounts or workflows |

Not implemented: advanced ENGINE animation/tilemap/minigame runtime and separate GameRelease execution, production asset-GC scheduling, malware scanning, donations, or a generative-AI integration. Database tables and historical plans alone do not make a feature delivered.

## Administrator information and documents

ADMIN accounts have a separate “Quản trị website” entry leading to `/admin`, with users, games, moderation and document sections.

`/admin/users` supports search, role/activity filters, creation, editing, password replacement, role assignment, account locking and deletion of accounts without owned games or retained content history. Inactive accounts cannot log in or reuse existing sessions. Self-demotion/locking/deletion and removing the last active administrator are blocked.

`/admin/games` searches across all owners, filters status/owner, edits metadata, access and visibility, and hides or quarantines content. Deletion is blocked when build/release history must be retained. New games use Studio and review decisions use the existing moderation workflow. Public visibility still requires approved, ready, clear content. User/game lists have ten records per page, responsive editors and unsaved-change protection.

`/admin/library` remains the information and document library.
They can create, read, edit and delete document categories and Markdown documents,
search title/content, read formatted tables/code, and follow imported document
links. Empty categories may be deleted; documents must first be moved or removed.
Concurrent stale saves/deletes are rejected with a version conflict. Guest, USER
and MODERATOR sessions cannot access these records. Library edits persist in
PostgreSQL and do not change executable source files or application configuration.

The administrator documentation library displays six documents per page with equal-size cards and a horizontally scrollable category rail. On phones, document cards form two columns and the reader opens below the list.

## Player activity and creator analytics

Public game detail supports explicitly launched plays, bounded active playtime, one rating per signed-in user (replace/remove), plain-text paginated comments and game-reported high scores when enabled. Detail views and Studio/moderator previews do not increment plays. Comment authors and moderators/admins may delete comments; creator ownership alone does not authorize deleting others.

`/studio/games/[id]/analytics` is private to the owner or ADMIN. It shows real aggregate plays, estimated account/browser participants, average active time, ratings/comments, a 30-day UTC chart and score collection settings. The dedicated moderator comment view exposes no creator analytics. Payments, favorites and ranked leaderboards remain unimplemented. Historical activity is not fabricated. See [activity and score integration](../04-workflows/game-scores-and-analytics.md).

Admin users/game lists match the selected editor height on desktop, with independently scrolling rows and fixed pagination controls. Stacked phone lists use bounded scrolling so the editor remains accessible.
