# UI remaster deployment — 2026-09-16

User explicitly authorized updating http://161.248.81.59/ after the remaster audit. Host eth0 owns that IP; Docker labels identify this worktree and Compose project `deploy-ip-preview`.

- Application revision: `ee72ba3dd2198c2f15e4b1ad57639cd9b69873f8`.
- Previous web image: `sha256:d193549613e5205e9dee18967243a0907861841bd0806117960e7f4ac2bcea9b`, preserved as `indieforge-web:rollback-before-ee72ba3`. Its Home source hash matched pre-remaster `9d2c8aa`.
- New web image: `sha256:980ca2ea7b0ec910e33b8fc51cea25860c9f4d4c34ee74f9c05d5f3e03edaccd`. Docker build/Next TypeScript passed. Runtime Home source SHA-256 matches the released checkout.
- Created a quiesced database/artifact backup pair via the documented runbook function: `backups/20260916T092917-524580.*`, validated archive contents and SHA-256 manifest. API/web briefly stopped and resumed. Backup metadata printed the release checkout; actual prior running image is recorded above. No data restore occurred.
- Recreated only web with Compose `up -d --no-deps --no-build --wait web`. API/database images and volumes retained. Resuming existing services during backup also started the existing migration job; exit0, eight migrations present, none pending.
- Web/API healthy; public `/api/health` returned200 and `status:ok`.
- Browser smoke at1440px and390px passed Home's new hero, registration display-name/confirmation and password toggle, Discover, no horizontal overflow, protected Studio/profile redirects, missing-route404 and no page errors. No application records created. Screenshots and smoke script: `/tmp/tfg-deployed-ee72ba3/`; mobile Home inspected.

Deployment complete. Do not rebuild/redeploy for this documentation-only record. Preserve rollback image and backup pair; no image/volume pruning performed.
