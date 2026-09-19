# Synthetic web-engine fixture validation

Status: approved for test-only implementation. This records synthetic compatibility evidence only; it does not claim support for a Unity or Godot release.

## Outcome

Provide deterministic test-only ZIP fixtures named `synthetic-unity-webgl` and `synthetic-godot-web`. Each represents a web-export static-file contract and contains a canvas runtime that receives real browser keyboard and pointer events. The generator must reject its own output unless it has generated, hashed, archived, re-inspected, and re-hashed the exact artifact it returns.

## Scope and boundary

- Fixtures and manifests exist only in test code. They are never client provenance, production metadata, or authorization to relax validation.
- This work changes no API, schema, CSP, iframe sandbox, network policy, or production extension allowlist.
- Results are **Synthetic Compatibility** only. **Real Engine Compatibility: NOT VERIFIED** remains the required conclusion.

## Fixture and manifest contract

Both archives contain root `index.html`, loader JavaScript, a valid eight-byte WASM module (`runtime.wasm`), and binary payload. The Unity-shaped fixture contains `Build/synthetic.data`; the Godot-shaped fixture contains `synthetic.pck`. The document loads the loader through a normal script request, draws to a canvas, and records keyboard and pointer input.

The generator fixes entry order, DOS timestamp, and ZIP compression. It creates an external manifest after packaging, avoiding a circular ZIP-hash dependency. The manifest includes `fixtureType: "synthetic"`, `engineVersion: "synthetic"`, fixture label, expected paths/MIME types, entry SHA-256 values calculated from source bytes, and ZIP SHA-256 calculated from archive bytes. No SHA-256 literal is allowed in test expectations or source.

## Required self-validation sequence

The public generator performs these gates before returning a fixture:

1. Generate entry bytes.
2. Hash each entry from those exact bytes.
3. Create the deterministic ZIP.
4. Hash ZIP bytes and construct the manifest.
5. Inspect the created ZIP using an archive reader, rather than generator input.
6. Verify exact paths, required files, duplicate-free paths, MIME/extension contract, and SHA-256 of each extracted entry.
7. Verify inspected ZIP hash against manifest ZIP hash.
8. Regenerate the label and require byte-for-byte archive and manifest equality.

Validation must reject a missing required path, MIME/extension mismatch, tampered archive, altered manifest digest, and nondeterministic regeneration.

## Browser evidence and policy limit

For each fixture, browser E2E uses ordinary owner upload, preview rendering, keyboard/pointer input, reload, submission, seeded-moderator approval, and anonymous public play. It observes capability asset responses and their MIME types and asserts the iframe remains `allow-scripts allow-pointer-lock` without `allow-same-origin`.

Existing `connect-src 'none'` means the runtime must not claim it fetched its `.wasm`, `.data`, or `.pck` inside the iframe. The test verifies static delivery outside the runtime; canvas behavior uses embedded valid WASM bytes. A real engine that needs those fetches requires a separate security decision.

## Acceptance

- Generator completes every self-validation gate at runtime for both labels.
- Repeated output has equal ZIP bytes and equal runtime-generated manifests.
- Upload/preview/input/reload/moderation/public-play pass without policy change.
- Reporting distinguishes verified Synthetic Compatibility from unverified Real Engine Compatibility.

