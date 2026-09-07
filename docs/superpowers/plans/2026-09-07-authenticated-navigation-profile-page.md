# Authenticated Navigation And Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show session-aware navigation, move profile editing to `/profile`, and provide a real navigation logout action.

**Architecture:** The server layout reads only the presence of the HTTP-only session cookie to choose navigation links. A small client logout control calls the existing API and navigates to login; the profile page reuses the existing profile form and protected server fetch behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-07-authenticated-navigation-profile-page-design.md`

## Global Constraints

- Keep the current cookie authentication and API contracts unchanged.
- Do not add dependencies or unrelated styling/refactors.
- Signed-in labels are exactly `Thông tin cá nhân` and `Đăng xuất`.
- Verify the complete browser journey before replacing the running IP preview.

---

### Task 1: Profile page and authenticated navigation

**Files:**
- Create: `apps/web/app/profile/page.tsx`
- Create: `apps/web/components/logout-button.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/studio/page.tsx`
- Test: `apps/web/e2e/account-game-flow.spec.ts`

**Interfaces:**
- Consumes: `privateGet<T>(path)` and `api.post<T>(path, body)`
- Produces: protected `/profile` page and `LogoutButton` navigation control

- [x] **Step 1: Write a failing browser test**

  Update the account journey to assert that signed-in navigation hides `Log in`, exposes `Thông tin cá nhân` and `Đăng xuất`, opens `/profile` for profile editing, and returns to signed-out navigation after logout.

- [x] **Step 2: Run the browser test to verify RED**

  Run: `pnpm --filter web e2e --grep "register, save a profile"`

  Expected: FAIL because the new navigation labels and `/profile` flow do not exist.

- [x] **Step 3: Implement the minimal behavior**

  Read `indieforge_access` in the async server layout, render the existing
  signed-out links or the two approved signed-in controls, implement logout via
  `api.post("/auth/logout", {})`, move the existing protected profile load and
  form to `/profile`, and remove them from `/studio`.

- [x] **Step 4: Run focused checks to verify GREEN**

  Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web e2e --grep "register, save a profile"`

  Expected: all commands exit 0.

### Task 2: Production preview verification

**Files:**
- Modify only if required by an observed deployment failure.

**Interfaces:**
- Consumes: existing `compose.production.yml` and `.env.production`
- Produces: updated web container serving the accepted behavior at `http://161.248.81.59`

- [x] **Step 1: Build and run all release checks**

  Run the repository test, typecheck, lint, browser E2E, deployment contract,
  and production build checks already used by this branch.

- [x] **Step 2: Rebuild only the affected production service and deploy**

  Use the existing production compose project and secret env file; do not
  recreate PostgreSQL or expose any new ports.

- [x] **Step 3: Verify the public browser journey**

  Register a disposable account through `http://161.248.81.59`, assert the
  authenticated menu, save profile data on `/profile`, confirm Studio has no
  profile form, click `Đăng xuất`, and confirm `/studio` redirects to `/login`.
