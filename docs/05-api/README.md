# API reference

The NestJS API listens on port `3001` by default. Local development calls routes directly; production Caddy exposes them below `/api` and strips that prefix before proxying. Controller source and Zod contracts are authoritative.

## Authentication and request policy

Successful registration/login sets the `indieforge_access` HTTP-only, `SameSite=Lax` JWT cookie for 15 minutes. It is `Secure` in production unless an operator explicitly sets `COOKIE_SECURE=false` for an HTTP preview. Protected routes do not accept a bearer-token alternative.

Browser mutations must provide an `Origin` exactly equal to `WEB_ORIGIN`. Fetch-metadata browser requests without an origin are rejected. Mutation bodies use `application/json`, except the explicit multipart upload routes for game ZIPs, covers, and project assets.

Roles are `USER`, `MODERATOR`, and `ADMIN`. Owner checks occur in services/repositories; hiding a UI control does not authorize a request. Moderator routes accept moderators and admins.

## Endpoint inventory

### General and authentication

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | Basic API response |
| GET | `/health` | Public | Process liveness (`{status:"ok"}`), not DB/storage readiness |
| POST | `/auth/register` | Public mutation | Create account and session |
| POST | `/auth/login` | Public mutation | Authenticate and create session |
| POST | `/auth/logout` | Session/browser mutation | Clear session cookie |
| GET | `/auth/me` | Authenticated | Read current account |
| GET | `/developers/me` | Authenticated | Read developer profile |
| PUT | `/developers/me` | Authenticated owner | Replace developer profile |

### Games and catalog

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/games` | Authenticated | Create legacy-source draft |
| POST | `/games/engine-projects` | Authenticated | Atomically create ENGINE game/project/revision |
| GET | `/games/mine` | Authenticated | List owned games |
| GET | `/games/:id` | Owner | Read an owned game |
| PATCH | `/games/:id` | Owner | Update mutable metadata |
| GET | `/discover` | Public | Paginated approved public catalog |
| GET | `/games/by-slug/:slug` | Public | Read an approved public game |

Game source types are `UPLOAD`, `CODE`, `STORY`, `PLATFORMER`, and `ENGINE`. Legacy project input contracts do not accept ENGINE documents.

### Legacy authoring and publication

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| PUT | `/games/:id/project` | Owner | Save validated CODE/STORY/PLATFORMER data |
| POST | `/games/:id/build` | Owner | Compile a legacy project into an artifact |
| POST | `/games/:id/upload` | Owner, multipart | Install HTML5 ZIP content |
| POST | `/games/:id/submit` | Owner | Submit ready content for review |
| GET | `/games/:id/preview/*` | Owner or moderator | Redirect to scoped artifact capability |
| GET | `/play/:slug/*` | Public approved game | Redirect to scoped public capability |
| GET | `/game-content/:token/*` | Capability | Deliver restricted immutable artifact content |

ZIP limits are 25 MiB compressed, 100 MiB expanded, and 1,000 entries. A root `index.html` is required. Unsafe paths, symbolic links, encrypted entries, duplicate paths, and unsupported content are rejected.

Upload exactly one multipart file named `game` whose filename ends in `.zip`; extra fields/files and missing input are rejected. Authentication and ownership are checked before multipart parsing. A successful upload returns the authoritative owner game summary with an incremented ready artifact version.

Preview and play routes return `302` with a relative `Location` pointing to the five-minute capability URL plus `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Preview permits the owner, moderator, or admin and returns `403` to other authenticated users. Play requires a public, clear, approved, ready game; unavailable games return `404`, and `AUTH_REQUIRED` games return `401` without a valid session. Capability reads return stored bytes with `Cache-Control: no-store`, `nosniff`, permissive read CORS without credentials, and the restrictive content CSP. Invalid/expired tokens, stale artifact versions, unauthorized auth-required capabilities, and missing/unsafe paths return `404`.

### Moderation

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/moderation/games` | Moderator/admin | List review queue |
| POST | `/moderation/games/:id/approve` | Moderator/admin | Approve submitted content |
| POST | `/moderation/games/:id/reject` | Moderator/admin | Reject with review note |

Moderation responses do not expose mutable creator source unnecessarily.

### Covers

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/games/:id/cover` | Owner, multipart | Validate and atomically replace cover |
| GET | `/games/:id/cover/:version` | Authenticated owner | Read a versioned private cover |
| GET | `/covers/:slug/:version` | Public game | Read versioned public cover |

Covers accept JPEG, PNG, or WebP up to 5 MiB. Versioned URLs prevent a mutable cover write from changing previously addressed bytes.

Upload exactly one multipart file named `cover` and no additional fields. Declared MIME must match the detected JPEG/PNG/WebP signature. Missing/malformed/mismatched input returns `400`, oversized input `413`, non-owner/unknown game `403`, concurrent game/version changes `409`, and storage/finalization outages `503`. Successful upload returns `201` with the complete owner game summary, incremented `coverVersion`, and detected `coverContentType`; cover-only updates preserve review state.

The private route serves only the owner's current positive safe-integer version and returns `Cache-Control: private, no-store`; the public route requires a public, clear, approved game and returns `Cache-Control: public, max-age=31536000, immutable`. Both return raw image bytes with their stored `Content-Type` and `X-Content-Type-Options: nosniff`. Missing, stale, malformed, or inaccessible versions return `404`. Existing addressed versions remain immutable on storage.

### ENGINE projects

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/games/:id/engine-project` | Owner | Read canonical head or adapted legacy view |
| POST | `/games/:id/engine-project/materialize` | Owner | Explicitly persist an adapted legacy project |
| PUT | `/games/:id/engine-project` | Owner | Save supported whole-document legacy form |
| POST | `/games/:id/engine-project/mutations` | Owner | Apply idempotent typed mutation batch |

Mutation batches include a base revision and stable mutation ID. A stale base produces a conflict instead of overwriting newer work. V2 editing uses mutation batches; whole-document writes are not a substitute for conflict-aware editing.

### Project assets

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/games/:id/assets` | Owner, multipart | Upload and process an asset |
| GET | `/games/:id/assets` | Owner | List/filter/paginate project assets |
| GET | `/games/:id/assets/:assetId` | Owner | Read asset metadata |
| PATCH | `/games/:id/assets/:assetId` | Owner | Rename mutable metadata |
| DELETE | `/games/:id/assets/:assetId` | Owner | Tombstone an asset |
| GET | `/games/:id/assets/:assetId/content` | Owner | Read immutable original bytes, including a retained tombstone |
| GET | `/games/:id/assets/:assetId/thumbnail` | Owner | Read generated thumbnail, including a retained tombstone |

Assets accept at most 10 MiB. Images are checked by content, metadata, dimensions, and pixel limits before Sharp processing. Storage URLs are not part of canonical documents; clients use stable asset IDs and API routes.

## Request and response contracts

### Accounts and profiles

Registration/login JSON is `{email, password}`. Email is trimmed, lowercased, and validated; both endpoints require passwords of 8–128 characters containing a lowercase letter, an uppercase letter, a digit (0–9), and punctuation or a symbol. Whitespace alone is not a special character; passwords are never trimmed. Existing passwords that do not meet these requirements are rejected on login. Registration returns `201`, login `200`, and both return `{id,email,role}` with `Set-Cookie`. Duplicate registration returns `409`. Logout returns `204` without a body and clears the cookie.

Profile replacement accepts `{displayName, bio?}` where display name is 2–50 trimmed characters and bio at most 500 characters. GET/PUT return `{displayName,bio}`; GET returns `404` when absent.

### Game metadata and public summaries

Game creation accepts `title` (1–80), slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`, description (0–2,000), access mode, source type, and viewport dimensions (integer 1–4,096, defaults 16×9). `PATCH` accepts a non-empty subset of title, description, access mode, and viewport fields; owner, slug, source, moderation, visibility, and cover metadata are not mutable there. Duplicate slugs return `409`.

Owner responses include identity, metadata, visibility/access/moderation/source/review state, `projectData`, artifact readiness/version, cover metadata, viewport, review timestamps/note, and creation/update timestamps. `GET /games/mine` returns an array of these objects.

`GET /discover` accepts `query` (≤200), opaque `cursor` (≤512), and positive integer `limit` (service caps it at 50; default 20). It returns `{games, nextCursor}`. Public summaries contain slug/title/description, developer display name, created time, artifact readiness/version, cover metadata, and viewport; they never contain owner email or project source.

### Legacy project contracts

- `CODE`: `{sourceType:"CODE", html, css, javascript}`, each source string at most 50,000 characters.
- `STORY`: 1–100 scenes, unique IDs up to 64 characters, existing start/choice targets, dialogue up to 5,000 characters, and at most 12 choices per scene.
- `PLATFORMER`: canvas 320–1,920 by 240–1,080, bounded player/goal/platform geometry, valid hex colors, and at most 100 platforms.

Save returns the updated owner workspace/summary used by Studio. Build/upload return the resulting authoritative game state. State conflicts such as an unavailable source or stale review revision return `409`; invalid project/archive content returns `400`.

Moderation approve JSON is `{artifactVersion, submittedAt}`. Reject adds `reviewNote` of 1–500 characters. Values must match the pending artifact exactly, preventing a stale review from approving newer content.

### ENGINE contracts

`POST /games/engine-projects` accepts `{title?}` only; title defaults to `Game chưa có tên`, is trimmed, and is limited to 80 characters. The response is `{game, project}` where `project` uses the read union below.

ENGINE reads/materialization/mutations return one of:

- `{status:"SUPPORTED", project, revision}` where revision is null for a non-materialized adapted view, otherwise `{revisionNumber,schemaVersion,contentHash,byteSize,retention,createdAt}`;
- `{status:"READ_ONLY", reason, raw, schemaVersion, diagnostics}` where reason is `UNSUPPORTED_FUTURE_SCHEMA`, `UNSUPPORTED_LEGACY_SOURCE`, or `INVALID_PROJECT`.

Whole-document save accepts `{baseRevision, project}` and currently validates the supported V1 write contract. It returns the new revision summary. Mutation save accepts strict JSON `{baseRevision, mutationId, mutations}`: base revision is a non-negative PostgreSQL integer below 2,147,483,647; mutation ID is 1–128 non-whitespace characters; mutations contain 1–100 engine-core commands. All JSON endpoints share a 4 MiB parser limit.

A stale base returns:

```json
{"statusCode":409,"code":"PROJECT_REVISION_CONFLICT","currentRevision":7}
```

Mutation responses return the authoritative `SUPPORTED` project and revision. Reusing a mutation ID with its original identity is idempotent; conflicting reuse or invalid asset/project references is rejected. Standard-revision compaction targets 100 while retaining pinned/referenced revisions.

### Asset contracts

Upload is multipart with exactly one `file` plus `uploadId` (UUID), optional `displayName` (1–160 characters; no control characters, slash, or backslash), and optional category. Categories are `MAP_TILESET`, `CHARACTER`, `NPC`, `ITEM`, `UI`, `AUDIO`, `EFFECT`, `IMAGE`, and `USER` (default). Retrying after an uncertain finalization must use the same upload ID and exact bytes; incompatible reuse returns `409`. A retryable finalization outage returns `503` and instructs the client to retry that identity.

Listing query fields are `search` (≤160), optional `kind` (`IMAGE`, `AUDIO`, `FONT`, `OTHER`), optional category, state (default `READY`), offset 0–100,000 (default 0), and limit 1–100 (default 30). It returns `{items,total,offset,limit}`.

Each asset summary includes IDs, kind/state/name, SHA-256 content hash, MIME type, byte size, optional dimensions/duration, import metadata, content/thumbnail API URLs, revision/build reference counts, timestamps, and tombstone time. Update accepts a non-empty `{displayName?,category?}` and only a `READY` asset. Delete returns the resulting summary and is idempotent after tombstoning; an in-progress upload conflicts.

Image inputs support PNG/JPEG/WebP, maximum dimension 8,192 and maximum 16,777,216 pixels. Thumbnails are deterministic sRGB PNGs bounded inside 256×256. Audio validation currently records bounded PCM/WAV-style metadata where supported; unsupported/corrupt formats return `400`. Content responses are `private, no-store`, set `nosniff`, and use a restrictive CSP.

## Content delivery security

Artifact capabilities expire after five minutes and are scoped to a game, artifact version, path class, and access purpose. Delivery applies a restrictive CSP. The web player uses a sandbox that allows scripts and pointer lock but not same-origin access. Creator scripts are never executed in the API during validation, build review, or moderation.

## Errors

Nest validation and domain services return conventional HTTP statuses: `400` invalid domain input, `401` missing/invalid session, `403` origin/ownership/role denial, `404` unavailable resource, `409` revision or state conflict, `413` size limit, and `415` unsupported media type. Use the actual controller/service tests for exact response payloads.

Related: [workflows](../04-workflows/authoring-publishing-and-assets.md), [database](../06-database/schema-and-migrations.md), and [security rules](../08-rules/coding-and-security-rules.md).

## Administrator documentation library

`/admin/library` requires authenticated ADMIN on every endpoint (database role is
re-read); browser mutations also require the existing trusted-origin policy.
GET `categories` lists categories/counts; POST creates; PATCH/DELETE
`categories/:id` update/remove. GET `documents` supports `query` (title/content),
`categoryId`, exact `sourcePath`, `offset` (0–100000), `limit` (1–100, default50),
returning `{items,total}` summaries. GET `documents/:id` includes Markdown content.
POST creates; PATCH/DELETE `documents/:id` update/remove. Mutation objects are
strict; update/delete require current positive integer `version`. Stale versions
and nonempty category deletion return409; unknown IDs404; invalid fields400.
`sourcePath` is server-owned import provenance. GET responses are private/no-store.


### Administrator user/game management

All routes require a currently active ADMIN; guests receive 401 and other roles 403. GET responses are private/no-store. `/admin/users` supports GET `{items,total}` and POST; `/admin/users/:id` supports GET/PATCH/DELETE. Queries accept `query`, optional `role`/`active` (`true` or `false`), `offset` and `limit` (default10, maximum50). Creation accepts normalized email, compliant password, optional display name, role and active state. PATCH accepts changed fields plus positive `version`; DELETE requires `version`. User responses contain identity, role, active state, profile name, game count and version, never password hashes. Inactive users cannot log in or authenticate existing cookies. Self-demotion/disable/delete and removal of the last active ADMIN are rejected; accounts with owned games or historical references cannot be deleted.

`/admin/games` GET lists games across all owners and review states; `/admin/games/:id` supports GET/PATCH/DELETE. Search matches title, slug or owner email; filters include ownerId, visibility, moderationState and reviewState with the same paging bounds. PATCH accepts title, description, accessMode, visibility and moderationState plus `updatedAt`; DELETE requires `updatedAt`. Metadata changes to pending/approved games reset review and visibility to DRAFT. Non-CLEAR moderation hides the game; clearing does not publish it. PUBLIC requires an approved ready artifact and CLEAR moderation. Games with build/release history or other retained references cannot be deleted; hide/quarantine instead. Immutable stored artifacts are retained. New game creation and approve/reject use the existing Studio/moderation flows, preserving their validation.
