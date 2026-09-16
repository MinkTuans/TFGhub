# Illustrated reference remaster — deployed 2026-09-16

The user rejected the earlier visual interpretation and explicitly requested immediate implementation and updating http://161.248.81.59/. The reference-led correction is now deployed.

Application revision: `1e44cd3f2a3eafa515c8e0276f8da3ba7cf805b0`.

The original twilight illustration, navy/lavender palette, yellow actions, serif headings and card treatment now span Home, Discover/detail, accounts, profile, Studio/create/manage and moderation. Studio has a sidebar and compact game rows; moderation uses expandable reviews; mobile has a real bottom navigation. Login is centered, registration split. Actual game covers/data and existing API contracts remain authoritative. The ENGINE workspace keeps its own visual system.

Verification:
- Focused unit suites passed (60 main checks, 54 creator checks, 31 review checks; overlapping suites, not an aggregate total). Login/theme review regressions were observed failing before fixes.
- 56 production-browser acceptance cases passed across batches: 20 before a local harness interruption, 28 in the next batch, 8 after restarting the interrupted local server. These include public no-JS rendering, account recovery, player geometry/fullscreen, moderation mutations, protected loading, four viewport widths and themes. Connection errors from terminated local test servers were diagnosed and their cases rerun.
- Short landscape player/dock overlap reproduced and fixed; 390×667 and 667×390 pass. Desktop login geometry regression changed from 304px off center to centered.
- Real disposable PostgreSQL/API ENGINE checks passed 2/2 (28.3s), including saved title persistence and hiding the site background/dock on mobile. Temporary containers and processes cleaned up.
- Production build and Docker build passed. Full lint: 0 errors, 1 existing hierarchy-panel aria-description warning. Final added E2E assertions passed targeted lint. Independent review found no remaining important issue.
- Desktop/mobile screenshots manually inspected. Local evidence: `/tmp/tfg-reference-final-browser/`; public evidence: `/tmp/tfg-reference-deployed/`.

Deployment:
- New web image: `sha256:6af0a57715a334d818bca52ebdd566dd20689d4c7009b8f0b87a98139fe961b8`.
- Previous image preserved as `indieforge-web:rollback-before-1e44cd3`, digest `sha256:980ca2ea7b0ec910e33b8fc51cea25860c9f4d4c34ee74f9c05d5f3e03edaccd`.
- Fresh database/artifact backup pair: `backups/20260916T101311-583067.*`; archive and SHA-256 manifest validated. Existing migration job resumed during backup restart and exited 0. No restore or data edits.
- Recreated only web with `up -d --no-deps --no-build --wait web`; web/API/PostgreSQL healthy. Runtime reference CSS and illustration hashes match the committed checkout.
- Live browser smoke passed at 1440px/390px: illustrated dark default, centered login, registration fields/password visibility, Discover, no horizontal overflow, protected redirects, missing-page 404 and no page errors. Public API health returned 200/status ok. No application records created by this smoke.

Complete. Documentation-only follow-up commits do not require another deployment. Stale wakeups must not redeploy or revert to the superseded cream/green plan.
