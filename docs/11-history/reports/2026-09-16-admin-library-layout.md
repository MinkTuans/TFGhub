# Compact administrator library layout — 2026-09-16

User supplied three screenshots and requested aligned cards, six documents per page, compact sliding categories, and phone optimization. All three screenshots inspected.

## Changes

- SSR and subsequent client queries request six documents; pagination displays current/total pages.
- Categories occupy a single horizontal rail above the reader/list, with native touch/keyboard scrolling and labeled left/right controls. No automatic slide movement; reduced-motion preference respected.
- Equal-size, left-aligned document cards clamp long titles and retain full accessible names. Desktop uses list/reader columns; phone uses two document columns and a full-width reader. Category controls remain available.
- Scoped margins remove global section spacing within the library, keeping panels aligned. Existing CRUD, role authorization, conflict handling and unsaved draft protection preserved.

## Verification / deployment

Initial regression tests failed in all three new cases (SSR limit, client pagination and slider controls); after implementation all 22 admin-library tests passed. Review found no blockers; filter-reset test strengthened to start from page two. Read-only production-data preview browser checks passed 320/390/768/1440 dark/light, covering six-card pagination, equal dimensions, no overflow, slider movement and reader/editor access. Final scoped margin adjustment and refreshed screenshots verified across all eight viewport/theme cases; all 22 tests passed again, and targeted ESLint passed. A browser smoke assertion initially checked the phone reader during smooth scrolling; waiting for the scroll position resolved that timing-only failure. Web Docker build/deployment still pending.

Evidence: `/tmp/tfg-library-layout`. Deployment authorized for 161.248.81.59; web-only release, no API/schema/data changes or reseeding. Do not duplicate active builds/deployment.
