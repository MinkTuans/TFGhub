# Web game upload compatibility baseline

Date: 2026-09-19

## Scope

This is a source and environment audit for the 100 MiB web-game upload plan. It does not claim Unity WebGL or Godot Web support.

## Current upload and sandbox contract

- The API accepts one owner-authorized ZIP with a root `index.html`.
- The current limits are 25 MiB compressed, 100 MiB expanded and 1,000 archive entries.
- The API validates containment, duplicate/conflicting paths, encryption, symlinks and an extension allowlist before immutable artifact installation.
- Preview and public play use capability URLs. Artifact responses are `no-store`, `nosniff`, CORS-readable without credentials and delivered in an opaque iframe sandbox with `allow-scripts allow-pointer-lock`; `allow-same-origin` is absent.
- CSP currently permits scripts/styles/images/media/fonts served from the capability URL, blob workers and no network connections. The current script source includes `'unsafe-eval'`; no change to CSP is authorized by this audit.

## Environment evidence

- `google-chrome` is installed and available for a Playwright executable-path configuration.
- No `unity`, `godot`, `chromium` or `chromium-browser` command is installed.
- No Unity/Godot web-export fixture (`.wasm`, `.pck`, `.unityweb`, game `.data`, `.glb`) exists outside dependencies in this repository. The only located WASM is Prisma's database query engine and is not a game fixture.

## Result

Unity WebGL and Godot Web compatibility are **unverified**. The current allowlist rejects their expected `.wasm`, `.data` and `.pck` files, so no preset can be described as supported. The next tasks may add bounded static-file support and upload guidance, but Task 5 must receive licensed minimal exports plus a disposable API/PostgreSQL/storage stack before it can mark either engine compatible.

## Follow-up evidence required

For each engine: exact version, export settings, fixture hash and license provenance; an actual upload → owner preview → reload → moderation → public play run; browser rendering plus keyboard and touch input; sandbox/CSP compatibility; package size, first playable frame and upload peak-memory measurement.

## Capability contract characterization

On 2026-09-19, project-owned HTML/JavaScript and the eight-byte WebAssembly
header fixture were uploaded through the ordinary owner ZIP flow, delivered by
an immutable capability URL, and run in Google Chrome (`/usr/bin/google-chrome`)
inside the exact opaque iframe sandbox. The regression is committed as
`37e0e6b` and runs with:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
  pnpm --filter api exec vitest run --config vitest.config.e2e.ts \
  test/games.e2e-spec.ts -t 'characterizes project-owned web engine capabilities'
```

| Capability | Result | Policy reason |
| --- | --- | --- |
| WASM instantiate | Available | Local WebAssembly construction requires no connection. |
| Blob Worker | Available | `worker-src blob:` explicitly permits the worker URL. |
| Blob URL fetched with `fetch()` | Blocked | `connect-src 'none'` governs the request. |
| Capability-relative fetch/XHR | Blocked | `connect-src 'none'` blocks the capability URL request. |
| IndexedDB | Blocked | The opaque sandbox does not provide supported persistent storage. |
| WebSocket | Blocked | `connect-src 'none'` blocks socket connection. |

The test also asserts the iframe remains
`sandbox="allow-scripts allow-pointer-lock"`; `allow-same-origin` is not
introduced. No CSP directive was changed. The fixture is a policy probe, not a
Unity/Godot substitute, so neither engine is compatible or supported on this
evidence.

## CSP decision gate

No named runtime with licensed fixture provenance has requested a blocked
capability. Therefore no CSP-change plan exists and no policy exception is
authorized. If such a runtime arrives, its separate plan must name one
directive, exact capability URL scope, browser proof and regressions preventing
external origins and same-origin sandbox access; broad `connect-src` values are
prohibited.
