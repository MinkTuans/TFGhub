# Authentication password policy — 2026-09-16

User requested registration/login passwords of at least eight characters with lowercase, uppercase, digits and special characters, and explicitly authorized creating a named ADMIN account. No account credential is stored in this report or repository.

## Change

Shared RegisterInput/LoginInput enforce 8–128 characters, Unicode lowercase and uppercase letters, an ASCII digit and Unicode punctuation/symbol. Whitespace is not a special character, and password bytes are not trimmed. Both forms show the Vietnamese policy with an accessible description and minimum length eight. Existing noncompliant passwords are rejected on login, as disclosed to the user. No database schema or authentication/session mechanism changes.

Existing HTTP/browser fixture passwords were updated to meet the policy. The ADMIN account is provisioned separately using the application's Argon2id hasher, never via a public role-setting endpoint.

## Verification and deployment

In progress. Contract regression was red (16 failures) before implementation and green with all 24 tests afterward. Web regression was red (three new cases). Authentication HTTP suite passed 37 tests including eight-character register/login, each missing complexity requirement, real hash verification, role protection and cookies. Full contracts suite passed 54 tests; focused form suites passed 50 tests. Contracts typecheck and targeted web lint passed. Browser acceptance passed at 390/768/1024/1440px, plus eight-character registration/profile-save recovery and full registration → profile → private draft → wrong/correct login flow. Independent review found two stale fixture passwords; both corrected, with the existing contracts case and account flow passing.

The initial browser startup exceeded 120 seconds under concurrent builds. A later 768px case encountered a shared Playwright artifacts-directory collision, and the full account flow exceeded its initial 30-second budget; isolated outputs and a 120-second flow budget passed without product changes. API/web Docker compilation and TypeScript completed; image export and production deployment still pending.

Evidence: `/tmp/tfg-password-policy`. Rollback tags captured before build: `indieforge-api:rollback-before-password-policy-20260916` and `indieforge-web:rollback-before-password-policy-20260916`. Do not duplicate ongoing builds/deployments on scheduled wakeup.
