# TFG UI remaster — audit and implementation plan

Status: in progress. User authorizes implementation and commits in `deploy-ip-preview`; no deployment performed for this task.

## Direction and constraints

The 25-part brief is the specification. The two supplied screenshots are baseline references, not a request to copy the existing navy/purple colors. Use warm off-white and green for light mode, retain functioning dark/system preferences. Preserve TFG branding and Vietnamese UI copy; retain the explicitly requested English Home concept. No schema, API, authentication, permission, publication or editor-state changes. No invented games, metrics, genres, creator profiles or release history. Use existing components and dependencies. User explicitly requests audit followed by implementation, with no renewed approval needed.

## Current architecture and audit

Next.js 16.3.4 App Router / React 19.2.8 in `apps/web`, plain global CSS with Tailwind import, semantic theme/spacing tokens. Next installed layout/error guides read. Server pages call `api.get`; private reads forward HTTP-only cookies through `privateGet`, redirecting 401 to login. Root `optionalSession` determines role-sensitive navigation. Client forms retain existing mutation contracts. ENGINE editor uses separate Studio shell/CSS and canonical revisions.

Routes: `/`, `/discover`, `/games/[slug]`, `/login`, `/register`, `/profile`, `/studio`, `/studio/games/new`, `/studio/games/[id]`, `/moderation`, and not-found. No dedicated public creator, category or release-history route. At the initial audit, root loading/error boundaries were absent; current delivery is documented in the checkpoints below.

Reusable components: GameCard/GameCover, FeatureIcon/TfgLogo, SiteNavigation/ThemeToggle/LogoutButton, AuthForm/ProfileForm/GameForm, GameWorkspace and source editors, CoverUploader/GamePreview/GamePlayer/RelatedGames, ModerationQueue, ENGINE Studio components. CSS already supplies buttons, forms, badges, panels, skeletons, focus and reduced-motion behavior; avoid a parallel component system.

Data: discovery supports query/cursor/limit, newest catalog entries, covers and developer displayName. It has no genre/platform/status filters or most-played sort, public creator ID/profile link, screenshots or changelog. Owner games expose review/visibility/artifact states and timestamps. Analytics/donations/ENGINE releases are not delivered; tables in schema are not working features. Registration only accepts email/password; display name requires the existing profile endpoint with honest partial-failure handling.

## Ordered delivery layers

- [x] 1. Foundation and Home (`app/globals.css`, `app/page.tsx`, `components/empty-state.tsx`, `components/site-footer.tsx`, `app/layout.tsx`). Warm palette, 1200–1400px content, structured hero, real latest games, explicit empty/error states, creation methods and publication steps. Footer links only existing routes with role-sensitive moderation. Test API success/empty/failure and footer role visibility, then web lint/typecheck and browser widths.
- [x] 2. Navigation and route resilience (`components/site-navigation.tsx`, `components/page-loading.tsx`, protected route `loading.tsx`, `app/error.tsx`, `app/global-error.tsx`). Mobile disclosure/drawer with Escape/close/focus behavior; preserve role/current-route/logout behavior. Shared loading skeleton and safe retry boundaries, including root session failure. Test keyboard and route transitions plus failure recovery.
- [x] 3. Catalog and game detail (`app/discover/page.tsx`, `components/game-card.tsx`, `app/games/[slug]/page.tsx`). Search/cursor preservation; explicit 4/2/1 responsive grid, hierarchy and actual metadata around existing sandbox player. Do not add unsupported filters or replace the functional player-first route. Test empty/error/pagination and player controls.
- [x] 4. Accounts/profile (`components/auth-form.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/profile/page.tsx`). Shared split layout, password visibility/confirmation, submitting/validation; inspect registration/profile contracts before adding display name. Test login/register/profile/logout and failure states.
- [x] 5. Studio and create/manage (`app/studio/page.tsx`, `app/studio/games/new/page.tsx`, `components/game-form.tsx`, `components/game-workspace.tsx`). Creator summary, actual game counts, searchable/filterable owner games, clear draft-to-release actions; preserve all editors and ENGINE preview. Test owner data/empty/filter/action routes and existing asset workflow.
- [x] 6. Moderation (`app/moderation/page.tsx`, `components/moderation-queue.tsx`). Queue hierarchy and review disclosure, accurate statuses and rejection validation; retain artifactVersion/submittedAt stale-review protection. No unsupported approved/rejected-history tabs. Test approve/reject/error/access.
- [ ] 7. Final route/browser audit. Run web suite, lint, typecheck, production build; test all routes at 1440/1024/768/390px, both themes, reduced motion, keyboard, loading/empty/error/success, no overflow/console errors/broken links. Keep screenshots and exact results. Commit only verified changes. Deployment is a separate step, never repeat it without tested changes.

## Risks and verification evidence

Global tokens affect editor chrome/player too: preserve specialized sizing and validate contrast in both themes. Home must distinguish API failure from empty catalog and must not label newest as trending/featured. Root session failure can happen before page error boundaries. Public game contracts cannot provide owner-only information. Existing regression tests may encode superseded copy; update those only where the brief explicitly changes it.

Starting revision: `9d2c8aa`, clean worktree. No implementation/test success claimed at audit time.


## Checkpoint — 2026-09-16, foundation slice

Implemented layer 1 and mobile navigation portion of layer 2. Added `EmptyState` and role-aware `SiteFooter`, Home two-column concept with actual catalog/empty/error, warm light tokens and 1280/1344px widths, mobile disclosure with Escape/focus and route close. No backend/schema/dependency edits. Independent review identified stale menu reopening after A→B→A history; reproduced with a failing test, fixed by discarding stored disclosure state when pathname changes; app-shell now 25/25 passing.

Validation in progress: focused Home/footer/card/shell initially 45/45; final production `next build` after review fix passed, all existing routes retained. Changed-file lint passes. Full web lint has zero errors and one pre-existing `aria-description` warning at Studio hierarchy-panel.tsx:190. Full unit run: 458/459 passed, only Canvas zoom test exceeded 5000ms during concurrent browser/build load; rerunning isolated before deciding root cause. Browser initial run: 7/8 passed (including 390/768/1440px and existing shell regression checks), 1024px recorded transient root `optionalSession` fetch timeout. This is not a clean browser result; rerun without concurrent build/tests. Screenshots under `apps/web/test-results/remaster-shell-*` cover light/dark at all widths; inspected 1440/390 light, layout has no horizontal overflow. Test games are isolated harness fixtures, never added to product data.

Next: finish isolated checks, commit this slice; then layer 2 loading/error/global-error (installed Next 16.3.4 uses `retry`, not older `reset`), catalog/details, auth/profile and Studio. Root session outage currently escapes page boundaries: global-error is required and still outstanding. No deployment performed.


### Verified outcome at 05:02 UTC

- Final production build after menu fix: PASS (Next compilation, TypeScript, generation and full route inventory).
- Changed-file ESLint: PASS, zero findings. Full lint warning above remains recorded.
- Full unit run: 458/459; isolated rerun of the entire failing Canvas file: 56/56 PASS, unchanged code and original timeout. No clean full-suite rerun claimed.
- Final isolated Playwright: **10/10 PASS in 41.9s**, `remaster-shell.spec.ts`, `final-review.spec.ts`, `game-player-contrast.spec.ts`. All four widths pass navigation, layout overflow and no pageerror checks; light/dark screenshots captured. Player fullscreen contrast >=4.5 in both themes. Initial transient API timeout did not reproduce without concurrent build/test load; production logic untouched.
- Independent reviewer verified A→B→A menu fix and reported no remaining important findings for this slice.
- No deploy. Layer 2 mobile navigation is delivered; loading/error/global-error and layers 3–7 remain open.


## Checkpoint — 2026-09-16 05:24 UTC, resilience and catalog

Delivered layer 2 route skeleton, page error and global error with shared safe retry UI. `retry()` re-fetches through Next; root fallback has its own Vietnamese document/title and stylesheet. Loading status sits outside the busy region. Root loading covers child content, not the root session fetch; root failures now have a recoverable fallback. No authentication/session behavior was altered.

Delivered layer 3: Discover query/cursor retained, per-page count (never a fabricated total), shared empty state, explicit 4/2/1 grid, mobile search controls, card hover/focus action. Detail retains existing player-first behavior and sandbox; adds cover, description and actual developer/date/artifact metadata. No genre/play/release-history/public-creator functions invented.

Verification: 39/39 focused unit tests passed; changed-file ESLint clean; production Next build with TypeScript passed. **9/9 production-browser tests passed in 28.1s**: search/empty/navigation/detail/no overflow/no unexpected page errors at 390/768/1440, light/dark fullscreen contrast, page and root-session API outage → retry recovery, delayed catalog → skeleton → real result. Test-only harness injects faults through `/__test/api-fault`; this code is outside production API and not shipped in its entry point. Expected server error logs during fault tests are intentional.

Independent review findings all reproduced and fixed: compact artwork 32px extra gap, loading live status under busy ancestor, and missing global error title. Regression tests failed before fixes and final browser/unit checks pass. Reviewed desktop detail and mobile Discover screenshots; artifacts copied to `/tmp/tfg-ui-remaster-20260916/catalog`. No deploy.

Next: layer 4 accounts/profile. Registration contract remains email/password only; displayName must use existing profile PUT after successful registration, with clear partial-failure recovery that never repeats account creation. Password confirmation is client-side only. Then Studio/create/manage/moderation and final route audit.


## Checkpoint — 2026-09-16, accounts/profile verification

Implemented split login/register layout, accessible password visibility and confirmation, display-name validation against the existing profile contract. Registration sends credentials only, then saves the profile through the existing PUT. If that save fails, credentials are removed and retry repeats only the profile save. Profile shows real owner game count, initials/bio and owner-only workspace links, with an explicit empty state. No endpoint or auth contract changed.

Broader account browser coverage exposed a regression from the previous root loading boundary: no-JavaScript public pages retained the streamed skeleton, and private-game 404 became an early streamed 200. Removed root loading and scoped the shared skeleton to Studio/profile/moderation; public content uses blocking SSR. Discover now progressively enhances its native GET form with transition progress, including repeated-query recovery. Root/page retry boundaries remain. Updated ambiguous browser assertions to match exact game headings and scope form alerts outside Next's route announcer.

Final verification: focused unit **59/59 PASS**; changed-file lint and production build PASS. Production Playwright **29/29 PASS (2.2m)** across account-game-flow, auth-remaster and route-recovery, with no skipped tests. Covers registration/profile retry (one registration POST, two profile PUTs), native credential POST, no-JavaScript public discovery/details, unpublished 404, moderation, legacy source editors, light/dark player and fullscreen, form widths390/768/1440, page/root retry, delayed and repeated searches. Earlier 22/26 run exposed the issues above; all now pass. Inspected desktop registration and mobile profile screenshots; seven screenshots retained at `/tmp/tfg-ui-remaster-20260916/accounts`. Independent final review found no remaining material issues. Protected-route skeleton rendering is covered by unit tests; delayed protected-route streaming remains part of final audit. No deployment.

Next layer implementation constraints: Studio filters/search/sort operate on actual `/games/mine` data; keep review-state counts distinct from visibility. Keep one-click blank ENGINE draft creation and all editor/state machinery. Management navigation may link existing sections, but must not invent analytics/release history. Moderation queue API provides pending entries only; retain artifactVersion/submittedAt concurrency protection.


## Checkpoint — 2026-09-16, Studio delivery

Layer 5 implemented: owner dashboard search (name/description), review-state filter, newest-update/name sort, result count and resettable no-match state; actual overall review counts remain unchanged. Cards retain private cover/workspace links and distinguish visibility from review. Creation page explains the existing blank ENGINE → edit → preview flow without changing its one-click creation request. Legacy management has in-page navigation and a return-to-Studio link; editor and submit logic unchanged.

Independent review found unnecessary full project serialization at the new client boundary. Reproduced with a failing test, then explicitly projected only nine card fields on the server; client Pick matches. Also corrected an undefined CSS token. Reviewer verified both fixes and found no remaining material issues. Focused unit46/46, changed-file lint and final production build PASS. Production browser **9/9 PASS (1.1m)**: dashboard filters/sort/reset and creation layout at390/768/1024/1440, light/dark and no overflow; management anchor navigation; registration/profile/draft/sign-in, HTML5 upload/retry/submit and CODE/STORY/PLATFORMER editor journeys. Screenshot capture corrected to scroll to the top before full-page capture; the four changed browser cases reran **4/4 PASS (22.4s)**. Screenshots inspected desktop/light, mobile/dark and mobile creation;12 artifacts retained at `/tmp/tfg-ui-remaster-20260916/studio`. ENGINE editor/assets require a separate disposable PostgreSQL stack; their internals are unchanged and were not exercised by this harness run.

Next: layer6 moderation hierarchy, readable submitted dates, explicit preview/review sections and empty queue, preserving concurrency fields and permission checks. Layer7 includes protected slow-loading browser test and final route audit.


## Checkpoint — 2026-09-16, moderation and final audit in progress

Layer6 implementation clarifies pending count, empty queue, human-readable UTC submission times, preview availability and review decision sections. Review version/time payload, permissions and sandbox are unchanged. Review notes are disabled during their submission. Focused moderation/form40/40PASS; independent review no material findings.

Final audit: full web unit **473/473 PASS,21 files,178.71s**, including Canvas with original timeouts. Full lint zero errors and one existing hierarchy-panel aria-description warning. Additional browser audit covers protected delayed loading, populated profiles with reduced motion/keyboard at four widths/two themes, moderation layouts, and1024px account/catalog checks. Production build PASS after removing an unsupported Testing Library query option in the new test (test-only TypeScript error); production browser **58/58 PASS (3.9m)**, no skips. Visual inspection subsequently found moderation preview inherited global min-height; a new ratio assertion failed (0.501 vs1.778) before the scoped height:auto/min-height:0 fix. Final production rebuild PASS, four affected browser cases **4/4 PASS (17.8s)** and final changed-file lint clean. Reviewer approved the scoped fix; corrected mobile screenshot inspected. Audit screenshots retained at `/tmp/tfg-ui-remaster-20260916/final`. Docker available; real ENGINE/assets lane still needs separate execution after the local browser audit.

Visual follow-up also reproduced a negative12px overlap between review heading and guidance caused by the global hint margin. Scoped heading-adjacent hint spacing to8px and added browser geometry assertion; Final production rebuild PASS, final affected-case browser **4/4 PASS (19.9s)**, lint clean and reviewer confirmed the scoped spacing fix. Corrected mobile screenshot inspected and archived. Layer6 ready to commit; layer7 remains open for the disposable ENGINE/assets lane and final delivery review.
