# Authentication password policy — 2026-09-16

User requested registration/login passwords of at least eight characters with lowercase, uppercase, digits and special characters, and explicitly authorized creating a named ADMIN account. No account credential is stored in this report or repository.

## Change

Shared RegisterInput/LoginInput enforce 8–128 characters, Unicode lowercase and uppercase letters, an ASCII digit and Unicode punctuation/symbol. Whitespace is not a special character, and password bytes are not trimmed. Both forms show the Vietnamese policy with an accessible description and minimum length eight. Existing noncompliant passwords are rejected on login, as disclosed to the user. No database schema or authentication/session mechanism changes.

Existing HTTP/browser fixture passwords were updated to meet the policy. The ADMIN account is provisioned separately using the application's Argon2id hasher, never via a public role-setting endpoint.

## Verification and deployment

Contract regression was red (16 failures) before implementation and green with all 24 tests afterward. Web regression was red (three new cases). Authentication HTTP suite passed 37 tests including eight-character register/login, each missing complexity requirement, real hash verification, role protection and cookies. Full contracts suite passed 54 tests; focused form suites passed 50 tests. Contracts typecheck and targeted web lint passed. Browser acceptance passed at 390/768/1024/1440px, plus eight-character registration/profile-save recovery and full registration → profile → private draft → wrong/correct login flow. Independent review found two stale fixture passwords; both corrected, with the existing contracts case and account flow passing.

The initial browser startup exceeded 120 seconds under concurrent builds. A later 768px case encountered a shared Playwright artifacts-directory collision, and the full account flow exceeded its initial 30-second budget; isolated outputs and a 120-second flow budget passed without product changes. API/web Docker compilation and TypeScript completed. The first build process exited 143 during image export before tags changed; a detached retry completed with exit 0 (`/tmp/tfg-password-policy/docker-build-retry.log`, marker `build.exit`).

Evidence: `/tmp/tfg-password-policy`. Rollback tags captured before build: `indieforge-api:rollback-before-password-policy-20260916` and `indieforge-web:rollback-before-password-policy-20260916`. Do not duplicate ongoing builds/deployments on scheduled wakeup.


## Completed live release

Deployed 2026-09-16 at approximately 12:47 UTC, code commit `902e374`. Validated consistent backup prefix `backups/20260916T124626-735425` (database, artifacts and SHA-256 manifest). No schema migration or document-library reimport required.

- Running API image: `sha256:4174ca157b5b50179d0d9baf90903384780cb7e9763195b24354d24e8d6327b8`.
- Running web image: `sha256:fce8ee6426cde89cd26c800d838d5700cff2e55cd96d1ccc22ce556c8de9f254`.
- Both services healthy; public health endpoint returned 200.
- Requested account was absent before provisioning; created exactly that account with Argon2id password hash and ADMIN role. No other account roles or passwords changed. Initial provisioning helper file permissions denied its execution; corrected that helper's read permission and reran only provisioning, without redeployment.
- Live browser verified login with supplied credentials, `/auth/me` ADMIN identity and `/admin/library` access at 390/1440px. Both forms show the eight-character policy without horizontal overflow; weak-password form feedback and all ten direct API invalid-password cases passed. Initial live locator matched Next's route announcer as well as the form alert; scoping to main resolved the smoke assertion without product changes.
- Live smoke created no disposable accounts; only the explicitly requested ADMIN was added. Test sessions logged out. Temporary plaintext credentials removed after verification.

Task complete. Do not repeat build, deployment or account creation on a scheduled wakeup. Completion documentation is a docs-only follow-up and needs no new deployment.
