# Illustrated daylight theme — 2026-09-16

The previous light theme reduced the opacity of the night illustration to 30%, washing out the scenery. The user's screenshot identified that effect and requested the same harbor in daytime.

The new `apps/web/public/art/tfg-daylight-world.png` is a built-in imagegen edit of the original landscape, preserving the lighthouse, dock, traveler, cat, islands and framing while changing the sky, water and lighting to daylight. Prompt and provenance are recorded in `apps/web/public/art/README.md`.

The explicit light theme now selects that image at full opacity. Localized scrims maintain text readability, with ivory surfaces, marine accents, matching header/footer/mobile navigation, brighter fallback artwork and a light player surround/showcase. The night/default illustration, Vietnamese font assets and editor theme remain intact.

## Verification

- 18 unique browser cases verified across daylight switching/persistence, public views, profile, moderation, Studio/create and player layout. The first runner was terminated with SIGTERM during the last file; 13 earlier cases had completed, and the five remaining/recheck cases passed in a detached runner (56.1 seconds). The initial mobile assertion was corrected for Chrome's rounded alpha serialization (0.96).
- Desktop/mobile screenshots inspected, including Home and game detail; evidence in `/tmp/tfg-daylight-browser` and `/tmp/tfg-daylight-recheck`.
- Changed-file ESLint and whitespace checks passed. No unit tests added for presentation-only CSS/artwork changes.
- Independent review found no blockers in cascade, dark/editor preservation or light surfaces.

## Deployment

Completed at approximately 11:06 UTC on 2026-09-16, http://161.248.81.59/.

- Application commit: `fc51609dd0d91fe4e4fd840278efcf3ea69eabd4`.
- Docker production build passed, including TypeScript and routes. Only web replaced using `--no-deps --no-build --wait`.
- Live image: `sha256:afb421a781acb059221f5809feee3ca208c58433436b80bf5f21e02952cda569`.
- Rollback tag: `indieforge-web:rollback-before-daylight-20260916`, prior image `sha256:e143133cfd5312f2c3ae015b86c41612c20a36213072fbf25c01a8aaf54bd9b2`.
- Validated database/artifact backup and checksum manifest: `backups/20260916T110452-639844.*`.
- Live browser smoke passed for health, daytime asset at full opacity, theme switching/persistence, Home/Discover/login/register at 390/1440 px, no overflow and no page errors. No application records created.
- Deployed CSS and daylight image SHA-256 match local files. Web/API healthy.
- Live screenshots/script: `/tmp/tfg-daylight-deployed`; log: `/tmp/tfg-daylight-live-smoke.log`.
- Task complete. No repeated deployment or scheduled continuation needed; documentation-only completion follows separately.
