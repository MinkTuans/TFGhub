# Coding and security rules

## Coding

- Prefer small, typed, deterministic changes over speculative abstractions.
- Validate transport input with shared contracts and domain invariants in their owning layer.
- Do not use array position as persistent identity or render/business ordering.
- Keep mutations atomic and replayable; preserve exact inverse/history semantics.
- Storage clients use abstractions and stable identifiers, not hardcoded public URLs.
- Preserve error causes internally while returning bounded, non-sensitive client errors.

## Authentication and authorization

- Keep session cookies HTTP-only and secure in production.
- Preserve trusted-origin checks for browser mutations.
- Check owner/role authorization before processing upload bytes.
- Re-read user state where role revocation must take effect.

## Untrusted content

- Never execute creator code in API, validation, moderation, thumbnails, or build inspection.
- Preserve path containment, symlink, archive-entry, MIME/magic-byte, size, dimension, and pixel checks.
- Preserve capability scope and expiry and the iframe sandbox without `allow-same-origin`.
- Treat Sharp and archive parsers as bounded processing surfaces.

## Secrets and operations

Use `.env.example` files for names and safe examples only. Production secrets must stay outside Git and logs. Pair database and storage backups. Treat `/health` as process liveness until it gains real dependency probes.
