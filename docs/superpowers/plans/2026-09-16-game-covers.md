# Game card overlap and game covers

User requests initials NC/RS no longer overlap play CTA; add image covers to every existing game. Screenshot 20260916-162147 shows homepage card fallback initials and CTA share lower-right anchor. Inventory verified: 11 public CODE games, all coverVersion0. Existing seed/score tasks complete; do not rerun them.

- [x] Reproduce and fix shared card fallback/CTA layout minimally, including future no-cover games, phone/desktop and compact cards.
- [x] Generate 11 unique genre-specific raster covers via built-in imagegen, no titles/text/buttons in image, commit optimized project-local assets with provenance.
- [x] Review and focused browser/unit verification, web build.
- [ ] Backup live DB/storage; upload covers through existing owner-authorized cover API with baseline/version checks, preserving game source/publication/activity; deploy web fix and verify all 11 live covers + phone/desktop no overlaps.
- [ ] Complete report/progress, clean test credentials and previews.

No schema changes. Scope of existing game mutation is cover fields/files only. Preserve immutable prior versions and use existing API validation/storage; no fake play/stat changes. Current live image rollback baseline API421efea2/webd6b30f34. Current code baseline f9e087c.

Rollout adjustment: discovered new Chess draft; include twelfth cover and keep it private. Initial preflight aborted before writes and restored original services.
