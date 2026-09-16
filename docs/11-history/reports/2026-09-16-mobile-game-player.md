# Mobile game player — 2026-09-16

Status: COMPLETE — deployed and live-verified 2026-09-16 17:25 UTC. Code commit: `92a52b1`; test typing follow-up: `15bfbb2`.
Production build completed successfully; log `/tmp/tfg-mobile-games/build-retry.log`. The initial build log is historical and failed only on fixture typing.

The user reported broken phone game displays. At 390×844 the public Snake game received a 330×330 iframe inside a 330×565 stage; its actual canvas was only 117px wide and the start overlay overlapped touch controls. Community games had long documents and the iframe's `scrolling="no"` made lower controls unreachable. At 320×568, merely using the full stage still left too little height for Snake's header, scores, board and controls.

The player now uses the full stage at widths up to 900px or with a coarse pointer, and allows game-document scrolling. Inline mobile players retain a minimum height of 32rem; short screens can scroll the surrounding page. Desktop keeps its measured aspect-ratio fit, now expressed through CSS properties. The sandbox and telemetry behavior remain unchanged. Native fullscreen remains limited to the available screen; individual game layouts still control their own rendering.

Validation before deployment:
- A real-browser regression failed on the original 330px iframe height; after the fix it passed full-stage sizing, Snake canvas/start-button containment, and wheel scrolling to lower Pipe controls.
- A short-screen regression failed at 327px stage height; the final CSS passed with room for the board and controls.
- 31 focused player, telemetry and engagement unit tests passed.
- Six browser tests passed: mobile sizing/scrolling at 320×568, 390×844 and 844×390, rotation/frame identity and desktop aspect ratio, plus fullscreen contrast in both themes.
- All 11 public games checked at 320px: no internal horizontal overflow, last visible enabled control reachable/clickable. Play telemetry was intercepted to avoid generating production activity.
- Eight real-game preview checks passed (320×568, 390×844, 844×390, 1440×900 × light/dark). Snake canvas widths were 187/298/230/551px, respectively; start button stayed inside the board and clear of touch controls. No page errors.
- Focused lint, full web typecheck and `git diff --check` passed. Independent code review found no blockers.

The initial production build compiled successfully but rejected the test fixture’s inferred generic element type at `srcdoc`; an explicit `HTMLIFrameElement` cast fixed it and full web typecheck passed before rebuilding.

Test development notes: Playwright's JSX transform cannot server-render the React component directly in its runner, so the browser fixture uses production CSS and component tests cover the iframe attributes. Catalog validation initially selected a deliberately hidden next-step button; restricting to visible enabled controls corrected the probe. Short landscape screens require scrolling the page as well as the game document, reflected in the final regression.

Image request remains incomplete: the user's message ended at “Còn ảnh…”. A clarification was requested; no image changes were inferred.

Completion:
- Deployed only the web service using `/tmp/tfg-mobile-games/deploy.sh`.
- Live web image: `sha256:4c76d25afea052f4a91bec4d9c18fbcfc934f7e11dcc4fd7093dca7a59d330c9`.
- Rollback retained: `indieforge-web:rollback-before-mobile-games-20260916` (`sha256:988abf8174ea0448797d2e0e1721a96724b94ff7afcbf1b6b14bf333fdc6db11`).
- API image unchanged; API, web and PostgreSQL healthy. No migrations, game-source changes or publication changes.
- Live verification passed: all 11 public games at 320px, eight viewport/theme checks, plus full-height Snake/start-button containment and real scrolling to Pipe controls. All mutation requests were blocked by browser probes; no synthetic activity was written.
- Public discovery metadata matched the captured pre-deployment response byte-for-byte.
- Reviewed the live phone screenshot; local development server stopped.
- Scheduled follow-ups must treat this as complete: do not rebuild or redeploy for stale wakeups. Image clarification remains pending user input.
