# Demo Introduction Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished, accessible, one-time-per-browser full-screen TFG introduction for presentation demos.

**Architecture:** A small Client Component owns browser storage, slide state, focus, and keyboard input. The Server Component root layout renders it globally without moving session handling or site chrome to the client. CSS in the existing global stylesheet uses the existing theme tokens and reduced-motion rule.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, existing CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-22-demo-introduction-popup-design.md`

## Global Constraints

- Use `tfg-demo-introduction-seen` only in browser `localStorage`; storage failures must not throw.
- Do not add dependencies, API calls, database fields, cookies, roles, or changes to publishing logic.
- Content must only claim documented current features: discovery, the four legacy creation paths, Pixel Studio, preview/submission, and moderation.
- Use Vietnamese copy, semantic dialog controls, Escape support, visible close/previous/next/indicator controls, and existing responsive/reduced-motion rules.
- Keep root layout as a Server Component; only the popup component has `"use client"`.

---

### Task 1: Define and prove presentation behavior

**Files:**
- Create: `apps/web/tests/demo-introduction.test.tsx`
- Create: `apps/web/components/demo-introduction.tsx`

**Interfaces:**
- Produces `DemoIntroduction(): JSX.Element | null`, imported by `app/layout.tsx`.
- Uses `window.localStorage` and no props.

- [ ] **Step 1: Write the failing test for first visit and slide controls**

```tsx
test("opens once with the TFG overview and changes slides from its controls", async () => {
  render(<DemoIntroduction />);
  expect(await screen.findByRole("dialog", { name: "Giới thiệu TFG" })).toBeVisible();
  expect(screen.getByText("Nền tảng trò chơi độc lập")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Slide 2: Tính năng chính" }));
  expect(screen.getByRole("heading", { name: "Tính năng chính" })).toBeVisible();
  expect(screen.getByText("Tạo game Pixel trong Studio")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails because the component does not exist**

Run: `pnpm --filter web exec vitest run tests/demo-introduction.test.tsx`

Expected: FAIL with module resolution error for `../components/demo-introduction`.

- [ ] **Step 3: Add the minimal interactive component**

```tsx
"use client";

const storageKey = "tfg-demo-introduction-seen";

export function DemoIntroduction() {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    try { setOpen(window.localStorage.getItem(storageKey) !== "true"); }
    catch { setOpen(true); }
  }, []);
  // Render four data-driven slides and controls only while open.
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/demo-introduction.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the tested component behavior**

```bash
git add apps/web/components/demo-introduction.tsx apps/web/tests/demo-introduction.test.tsx
git commit -m "feat(web): add demo introduction popup behavior"
```

### Task 2: Cover persistence, keyboard access, and the final route

**Files:**
- Modify: `apps/web/tests/demo-introduction.test.tsx`
- Modify: `apps/web/components/demo-introduction.tsx`

**Interfaces:**
- Consumes `DemoIntroduction()` from Task 1.
- Produces close behavior that writes `tfg-demo-introduction-seen` and an accessible `/discover` final link.

- [ ] **Step 1: Write failing tests for close persistence, Escape, arrows, and final action**

```tsx
test("records dismissal and does not reopen in the same browser", async () => {
  const view = render(<DemoIntroduction />);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Đóng giới thiệu" }));
  expect(localStorage.getItem("tfg-demo-introduction-seen")).toBe("true");
  view.unmount();
  render(<DemoIntroduction />);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("supports Escape, arrow keys, and discovery from the final slide", async () => {
  render(<DemoIntroduction />);
  const dialog = await screen.findByRole("dialog");
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  expect(screen.getByRole("link", { name: "Khám phá website" })).toHaveAttribute("href", "/discover");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify each new assertion fails**

Run: `pnpm --filter web exec vitest run tests/demo-introduction.test.tsx`

Expected: FAIL because close persistence, keyboard navigation, and/or the final link are absent.

- [ ] **Step 3: Implement the minimal accessibility and persistence behavior**

```tsx
function close() {
  try { window.localStorage.setItem(storageKey, "true"); } catch {}
  setOpen(false);
}

onKeyDown={(event) => {
  if (event.key === "Escape") close();
  if (event.key === "ArrowLeft") setSlide((current) => Math.max(0, current - 1));
  if (event.key === "ArrowRight") setSlide((current) => Math.min(slides.length - 1, current + 1));
}}
```

- [ ] **Step 4: Run focused tests to verify all popup behavior passes**

Run: `pnpm --filter web exec vitest run tests/demo-introduction.test.tsx`

Expected: PASS with all tests green.

- [ ] **Step 5: Commit interaction coverage**

```bash
git add apps/web/components/demo-introduction.tsx apps/web/tests/demo-introduction.test.tsx
git commit -m "feat(web): make demo introduction accessible"
```

### Task 3: Integrate visual presentation and document the behavior

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `docs/03-features/current-capabilities.md`
- Modify: `apps/web/tests/app-shell.test.tsx`

**Interfaces:**
- Consumes the exported `DemoIntroduction` component.
- Produces a globally rendered full-screen visual layer that remains theme-aware and responsive.

- [ ] **Step 1: Write failing integration/style assertions**

```tsx
test("renders the demo introduction from RootLayout", async () => {
  render(await RootLayout({ children: <main>Trang chủ</main> }));
  expect(await screen.findByRole("dialog", { name: "Giới thiệu TFG" })).toBeVisible();
});

test("defines responsive full-screen presentation styles", () => {
  expect(globalStyles).toMatch(/\.demo-introduction\s*\{[\s\S]*position:\s*fixed/);
  expect(globalStyles).toMatch(/@media \(max-width: 48rem\)[\s\S]*demo-introduction/);
});
```

- [ ] **Step 2: Run integration tests to verify they fail before layout/CSS changes**

Run: `pnpm --filter web exec vitest run tests/app-shell.test.tsx`

Expected: FAIL because `DemoIntroduction` is not yet rendered by the root layout and styles are absent.

- [ ] **Step 3: Integrate and style the component with existing tokens**

```tsx
// app/layout.tsx
import { DemoIntroduction } from "../components/demo-introduction";
// Render <DemoIntroduction /> after <MobileNavigation />.
```

```css
.demo-introduction { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: clamp(1rem, 4vw, 3rem); background: color-mix(in srgb, var(--page) 58%, transparent); backdrop-filter: blur(10px); }
.demo-introduction__panel { width: min(100%, 70rem); max-height: min(48rem, 100%); overflow: auto; border: 1px solid var(--border); background: var(--surface-raised); box-shadow: var(--shadow-lg); }
```

- [ ] **Step 4: Update current capabilities documentation**

Add a short “Presenter introduction” entry stating that the client-only introduction opens once per browser and is stored under `tfg-demo-introduction-seen`; it does not affect accounts or product workflows.

- [ ] **Step 5: Run integration and focused tests to verify they pass**

Run: `pnpm --filter web exec vitest run tests/demo-introduction.test.tsx tests/app-shell.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit integration, styles, and docs**

```bash
git add apps/web/app/layout.tsx apps/web/app/globals.css docs/03-features/current-capabilities.md apps/web/tests/app-shell.test.tsx
git commit -m "feat(web): present TFG introduction on first visit"
```

### Task 4: Run delivery verification

**Files:**
- Verify only: all files changed above

- [ ] **Step 1: Verify whitespace and final diff scope**

Run: `git diff --check HEAD~3..HEAD && git status --short`

Expected: no whitespace errors; no uncommitted work.

- [ ] **Step 2: Run the required app checks**

Run: `pnpm --filter web typecheck && pnpm --filter web build`

Expected: both commands exit 0.

- [ ] **Step 3: Inspect presentation behavior manually**

Run: `pnpm --filter web dev`

Expected: first browser visit opens four slides; close, Esc, arrows, indicators, and `/discover` link work; reloading after close does not reopen; narrow viewport keeps controls visible.

- [ ] **Step 4: Commit if verification introduced no changes and report evidence**

```bash
git log --oneline -3
git status --short
```
