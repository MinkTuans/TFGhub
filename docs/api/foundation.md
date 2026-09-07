# TFG foundation API

Development base URL: `http://localhost:3001`; the production proxy exposes these routes under the site's `/api` prefix. JSON request bodies use `Content-Type: application/json`. Identifiers and timestamps below are illustrative; use the returned identifiers in later requests.

Authentication is cookie-based. `POST /auth/register` and `POST /auth/login` issue the HTTP-only `indieforge_access` cookie; protected routes require that cookie. The HTTP examples below show the cookie as a placeholder request header; see the development guide for a curl cookie-jar example.

Browser mutations require an `Origin` exactly matching `WEB_ORIGIN`; untrusted or opaque origins receive `403`. Mutation bodies require JSON, except the dedicated multipart artifact and cover upload routes (`415` for unsupported content types). Bodyless logout and non-browser JSON clients without an `Origin` are supported.

## Register

```http
POST /auth/register
Content-Type: application/json

{"email":"ava@example.test","password":"password123"}
```

`201 Created`, with `Set-Cookie: indieforge_access=...; HttpOnly; SameSite=Lax; Path=/`:

```json
{"id":"cmexampleuser1","email":"ava@example.test","role":"USER"}
```

Emails are trimmed and lowercased. Passwords must be 10–128 characters. A duplicate email returns `409`.

## Login and current user

```http
POST /auth/login
Content-Type: application/json

{"email":"ava@example.test","password":"password123"}
```

`200 OK` returns the same user shape and refreshes the 15-minute session cookie:

```json
{"id":"cmexampleuser1","email":"ava@example.test","role":"USER"}
```

```http
GET /auth/me
Cookie: indieforge_access=...
```

`200 OK`:

```json
{"id":"cmexampleuser1","email":"ava@example.test","role":"USER"}
```

Missing, expired, malformed, or bearer-token-only authentication returns `401`.

## Logout

```http
POST /auth/logout
Cookie: indieforge_access=...
```

`204 No Content`, with `Set-Cookie: indieforge_access=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Path=/`. The response has no body and clears the browser session cookie.

## Developer profile

```http
PUT /developers/me
Cookie: indieforge_access=...
Content-Type: application/json

{"displayName":"Ava Buildwell","bio":"Makes tiny space games."}
```

`200 OK`:

```json
{"displayName":"Ava Buildwell","bio":"Makes tiny space games."}
```

`displayName` must be 2–50 characters; `bio` is at most 500 characters. `GET /developers/me` returns this same shape, or `404` when no profile has been created.

## Create a draft

```http
POST /games
Cookie: indieforge_access=...
Content-Type: application/json

{"title":"Orbit Orchard","slug":"orbit-orchard","description":"Grow fruit in zero gravity.","accessMode":"GUEST_ALLOWED"}
```

`201 Created`:

```json
{
  "id": "cmexamplegame1",
  "slug": "orbit-orchard",
  "title": "Orbit Orchard",
  "description": "Grow fruit in zero gravity.",
  "visibility": "DRAFT",
  "accessMode": "GUEST_ALLOWED",
  "moderationState": "CLEAR",
  "sourceType": "UPLOAD",
  "reviewState": "DRAFT",
  "projectData": null,
  "artifactVersion": 0,
  "artifactReady": false,
  "coverVersion": 0,
  "coverContentType": null,
  "viewportWidth": 16,
  "viewportHeight": 9,
  "reviewNote": null,
  "submittedAt": null,
  "reviewedAt": null,
  "createdAt": "2026-09-05T12:00:00.000Z",
  "updatedAt": "2026-09-05T12:00:00.000Z"
}
```

Slugs use lowercase letters and digits separated by single hyphens. Client-supplied visibility, moderation state, and owner values are ignored; creation is always a clear draft. Duplicate slugs return `409`.

`sourceType` accepts `UPLOAD` (default), `CODE`, `STORY`, or `PLATFORMER`.
`viewportWidth` and `viewportHeight` are integers from 1 to 4096, defaulting to
16 and 9. They describe the player's aspect ratio, not a forced pixel size;
either may be supplied at creation or changed through the update route.
`coverVersion: 0` and `coverContentType: null` mean there is no cover. Successful
uploads return a positive version and one of `image/jpeg`, `image/png`, or
`image/webp`. These four cover/viewport fields appear on both owner and public
summaries; cover fields are read-only metadata maintained by the upload route.

## Update an owned game (`PATCH /games/:id`)

```http
PATCH /games/cmexamplegame1
Cookie: indieforge_access=...
Content-Type: application/json

{"title":"Orbit Orchard: Seedling"}
```

`200 OK` returns the complete owner summary shown above with the updated title
and timestamp.

The body must contain at least one of `title` (1–80 characters), `description`
(at most 2,000 characters), `accessMode` (`GUEST_ALLOWED` or `AUTH_REQUIRED`),
`viewportWidth`, or `viewportHeight` (each 1–4096). `slug`, `sourceType`,
ownership, visibility, cover metadata, and moderation state cannot be supplied
as updates. Only the owner may update the game: a missing session returns
`401`, and an authenticated non-owner or an unknown game returns `403`.

Updating metadata, including viewport dimensions, resets a `PENDING` or
`APPROVED` game to `DRAFT` review and visibility and clears its review metadata.
It must be submitted and approved again to become public. A cover-only upload
preserves the current review state.

## List owned games

```http
GET /games/mine
Cookie: indieforge_access=...
```

`200 OK` returns an array of the complete owner-summary objects shown above,
containing only games owned by the authenticated user.

## Game covers

```text
POST /games/:id/cover             owner multipart upload (cover)
GET  /games/:id/cover/:version    authenticated owner preview
GET  /covers/:slug/:version       approved public cover
```

Upload exactly one multipart file named `cover`, with no additional fields.
The limit is inclusive: 5 MiB (5,242,880 bytes). The server accepts JPEG, PNG,
and WebP when the declared MIME type matches the detected file signature.
It checks signatures, not full image decoding or malware scanning. SVG, GIF,
missing files, malformed signatures, extra fields/files, and mismatched MIME
types return `400`; larger files return `413`. Authentication and ownership
are checked before multipart parsing; missing sessions return `401`, and an
authenticated non-owner or unknown game returns `403`.

For a production deployment with an existing authenticated curl cookie jar:

```bash
curl --fail --show-error \
  --cookie cookies.txt \
  -H "Origin: $PUBLIC_ORIGIN" \
  -F 'cover=@cover.png;type=image/png' \
  "$PUBLIC_ORIGIN/api/games/cmexamplegame1/cover"
```

`201 Created` returns the complete owner summary with incremented
`coverVersion` and the detected `coverContentType`. Existing cover versions
remain immutable on disk. Concurrent game changes can return `409`; storage
or finalization failures can return `503`.

Owner preview requires the owner's session and returns
`Cache-Control: private, no-store`. Public cover reads require a `PUBLIC`,
`CLEAR`, `APPROVED` game and return
`Cache-Control: public, max-age=31536000, immutable`. Public covers are readable
without a session, including for games whose play access requires login.
Both routes send the stored image bytes with the image `Content-Type` and
`X-Content-Type-Options: nosniff`.

Only the current positive safe-integer cover version is readable; missing,
outdated, invalid, or inaccessible public versions return `404`. A public
cache may retain a previously fetched immutable version after a later change.
The API stores bytes at `GAME_STORAGE_ROOT/covers/<game-id>/<version>/cover`
with adjacent `.indieforge-cover.json` metadata. Covers share the backed-up
storage volume with game artifacts but are served only as image bytes, never
as executable artifacts. See [backup and restore](../deployment.md#back-up).

## Build and review

Owners can upload HTML5 ZIP artifacts, or save and build Code, Story, and
Platformer projects in Studio. Once an artifact is ready,
`POST /games/:id/submit` sends it for review. Moderator-only
`GET /moderation/games` lists the pending revisions;
`POST /moderation/games/:id/approve` accepts the returned `artifactVersion`
and `submittedAt`, while `POST /moderation/games/:id/reject` also requires a
`reviewNote` (1–500 characters). Approval makes the game public; stale review
revisions cannot approve a newer artifact. Moderator access is granted by an
operator, as described in the [deployment runbook](../deployment.md#moderator-role-assignment).

## Discover public games

```http
GET /discover?query=orbit&limit=20
```

`200 OK`:

```json
{"games":[{"slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","developer":{"displayName":"Ava Buildwell"},"createdAt":"2026-09-05T12:00:00.000Z","artifactVersion":1,"artifactReady":true,"coverVersion":1,"coverContentType":"image/png","viewportWidth":16,"viewportHeight":9}],"nextCursor":null}
```

`query` is optional and matches title or description without case sensitivity. `limit` defaults to 20 and is capped at 50. Pass a non-null `nextCursor` back as the `cursor` query parameter to fetch the next page. Only `PUBLIC`, `CLEAR`, `APPROVED` games are returned.

## Look up a public game

```http
GET /games/by-slug/orbit-orchard
```

`200 OK`:

```json
{"slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","developer":{"displayName":"Ava Buildwell"},"createdAt":"2026-09-05T12:00:00.000Z","artifactVersion":1,"artifactReady":true,"coverVersion":1,"coverContentType":"image/png","viewportWidth":16,"viewportHeight":9}
```

This response never includes the owner's email. Draft, unlisted, flagged,
quarantined, unapproved, or missing games return `404`. TFG uses the versioned
cover URL when available and a deterministic 16:9 fallback otherwise. The
player uses the declared viewport ratio; desktop theme and fullscreen
acceptance are documented in the [deployment guide](../deployment.md#tfg-desktop-acceptance).
