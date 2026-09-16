# Phone Discover layout correction — 2026-09-16

Both user screenshots showed Discover on a phone: the search input was right-aligned above its submit button, and fallback cover initials overlapped the card action. Two-column cards also displayed overlong titles and descriptions.

Root causes: globals.css switches search to a column below 47.99rem, while the later illustrated stylesheet aligns that column to its end; the always-visible touch action shares the fallback initials' bottom-right position. The mobile description rule targeted a class absent from GameCard.

The correction is limited to Discover at widths up to 768px in reference-world.css: keep input and button in one row with a shrinking label, put the card action in normal flow below its 16:9 cover, reduce fallback initials, clamp titles to two lines and hide descriptions using their actual class. Desktop rules and application data are unchanged.

## Verification

- Original live page reproduced search-row failures at 320/390/430px and three overlapping fallback actions at all tested mobile widths; 320px also clipped all four actions.
- Local CSS preview on real public data passed at 320/390/430/768/1440px in dark and light themes: search row, input width, mobile action containment/separation and no horizontal page overflow. Mobile screenshots inspected.
- Independent CSS/markup review found no blockers in cascade, scope or cover/action placement.
- No new unit tests for presentation-only CSS. Browser evidence/scripts: `/tmp/tfg-phone-fix`.

## Deployment

Completed at approximately 11:25 UTC on 2026-09-16 at http://161.248.81.59/.

- Application commit: `d475c16c78afe14486fd270f52ffb517655d46a2`.
- Docker production build passed including TypeScript and routes. Live image: `sha256:d8ec7bcf5830112c535c60325bba9b28d6dd816a73bd16ae2d357663d6d34ffb`.
- Validated database/artifact backup and SHA-256 manifest: `backups/20260916T112414-658018.*`. Only web replaced using `--no-deps --no-build --wait` after backup services restarted.
- The initial attempt stopped before replacement because the old running image manifest was unavailable after the build: image tagging and container commit both failed with missing image/content. Resolved by exporting/importing the old running container filesystem into `indieforge-web:rollback-before-phone-catalog-20260916`, image `sha256:4eb33aef01f3aca8cd322e90e4ab37cb8f63e833290eb7a2d7585f6470389bc7`, with runtime settings restored. A temporary container booted this snapshot and served Discover successfully, then was removed. Rollback snapshot is retained.
- Live browser checks without CSS injection passed all ten size/theme cases (320/390/430/768/1440px, dark/light). Mobile search stays in one row with no horizontal overflow; card actions neither overlap initials nor clip. Desktop layout remains unchanged; desktop hover overlay geometry is outside this mobile fix.
- Live interaction smoke passed search submission/results, card navigation, empty-search reset, health and no page errors. No application records created.
- Deployed source CSS SHA-256 matches the local checked file. Web/API healthy. Live mobile screenshots inspected.
- Evidence: `/tmp/tfg-phone-fix/live.log`, `interaction-live.log`, `live-390-dark.png`, `live-390-light.png`; scripts and deployment/build logs in the same directory.
- Task complete. Do not repeat deployment or tests on a scheduled wakeup. Documentation completion is a separate commit requiring no deployment.
