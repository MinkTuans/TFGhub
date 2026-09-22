# Demo Introduction Popup Design

## Goal

Provide a concise, full-screen introduction that a presenter can show once in a browser while demonstrating TFG. It must explain real, currently available product capabilities without changing any game, account, moderation, or publishing behavior.

## Scope

The introduction is a client-only presentation layer rendered from the root layout. On its first hydrated render, it checks `localStorage` for the key `tfg-demo-introduction-seen`. If absent, it opens. Closing it or activating the final call to action writes the key. A later page load in the same browser does not reopen it.

No API request, database field, cookie, role check, or server-side session behavior changes. Browser storage failures leave the introduction usable for the current page without throwing an error.

## Content

The dialog has four slides, each intentionally brief:

1. **Tổng quan** — TFG logo; “Nền tảng trò chơi độc lập”; one sentence that TFG lets people discover, create, and share small browser games.
2. **Tính năng chính** — cards for currently implemented capabilities: discover public games; create games through HTML5 ZIP, code, story/quiz, or platformer paths; create pixel games in Studio; preview and submit a game for review; moderate submitted games. These claims come from the current home page, navigation, and documented capabilities.
3. **Quy trình sử dụng** — “Tạo trò chơi → Xem trước → Gửi duyệt → Khám phá công khai”. This extends the existing documented three-step publishing flow with the approved-public-game discovery outcome.
4. **Kết thúc** — “Sẵn sàng khám phá?” and a link to `/discover` labeled “Khám phá website”.

## Interaction and Accessibility

The component uses a semantic modal dialog with `aria-modal`, an accessible title, focus on the dialog’s first actionable control, and an `Escape` handler. It provides a close button, previous/next buttons, and a four-button slide indicator whose selected state is communicated with `aria-current`. The first slide disables Previous and the final slide replaces Next with the discovery call to action.

Slides animate only with a short opacity/translate transition. The existing global reduced-motion rule reduces this motion. The visual layer is responsive: desktop presents a centered, spacious card; narrow screens keep all controls reachable and use a single-column feature-card grid.

## Implementation Boundary

- Create `apps/web/components/demo-introduction.tsx` for presentation state, storage handling, keyboard behavior, SVG icons, and slide data.
- Import the component from `apps/web/app/layout.tsx` so it can cover every route while keeping the root layout a Server Component.
- Add scoped styles to `apps/web/app/globals.css`, using existing TFG theme tokens and responsive/reduced-motion rules.
- Create `apps/web/tests/demo-introduction.test.tsx` for first-open, one-time persistence, keyboard navigation, controls, and final link behavior.
- Update `docs/03-features/current-capabilities.md` to document the browser-only presenter introduction.

## Verification

Focused Vitest tests must first fail before production code exists, then pass after implementation. The app-shell test remains green to ensure the root layout stays compatible. Before release, run the focused test suite, web typecheck, production web build, and `git diff --check`.
