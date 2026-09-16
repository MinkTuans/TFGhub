# Header background opacity — 2026-09-16

Status: COMPLETE — deployed and live verified. Do not redeploy for stale wakeups.

User requested equal light/dark header background transparency. Commit `86a8895` changes only light header background from `#fffdf4df` to `#fffdf485`, matching the dark background alpha `85`. Original colors, border and 14px blur remain intact.

Browser computed-style checks passed locally and live at 390px and 1440px: light `rgba(255, 253, 244, 0.52)`, dark `rgba(10, 20, 59, 0.52)`, both `blur(14px)`. Web production build including TypeScript passed, then only web was recreated; API image unchanged and services healthy.

Built from the exact previous runtime image with the one CSS source copied in and a full `pnpm --filter web build` (public API `/api`, ads disabled). Recipe/logs/screenshots: `/tmp/tfg-header-opacity/`. The regular repository Dockerfile also includes the committed change.

Live image: `sha256:965efb567e133cf1e9213763f65cdb59d1fc4d5fd3b4816eaee260da237f15a6`. Rollback retained at `indieforge-web:rollback-before-header-opacity-20260916`.
