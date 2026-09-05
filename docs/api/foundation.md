# Foundation API

Base URL: `http://localhost:3001`. JSON request bodies use `Content-Type: application/json`. Identifiers and timestamps below are illustrative; use the returned identifiers in later requests.

Authentication is cookie-based. `POST /auth/register` and `POST /auth/login` issue the HTTP-only `indieforge_access` cookie; protected routes require that cookie. The HTTP examples below show the cookie as a placeholder request header; see the development guide for a curl cookie-jar example.

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
{"id":"cmexamplegame1","slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","visibility":"DRAFT","accessMode":"GUEST_ALLOWED","moderationState":"CLEAR","createdAt":"2026-09-05T12:00:00.000Z","updatedAt":"2026-09-05T12:00:00.000Z"}
```

Slugs use lowercase letters and digits separated by single hyphens. Client-supplied visibility, moderation state, and owner values are ignored; creation is always a clear draft. Duplicate slugs return `409`.

## Update an owned game (`PATCH /games/:id`)

```http
PATCH /games/cmexamplegame1
Cookie: indieforge_access=...
Content-Type: application/json

{"title":"Orbit Orchard: Seedling"}
```

`200 OK` returns the updated game-summary shape:

```json
{"id":"cmexamplegame1","slug":"orbit-orchard","title":"Orbit Orchard: Seedling","description":"Grow fruit in zero gravity.","visibility":"DRAFT","accessMode":"GUEST_ALLOWED","moderationState":"CLEAR","createdAt":"2026-09-05T12:00:00.000Z","updatedAt":"2026-09-05T12:05:00.000Z"}
```

The body must contain at least one of `title` (1–80 characters), `description` (at most 2,000 characters), or `accessMode` (`GUEST_ALLOWED` or `AUTH_REQUIRED`). `slug`, ownership, visibility, and moderation state cannot be changed by this endpoint. Only the owner may update the game: a missing session returns `401`, and an authenticated non-owner or an unknown game returns `403`.

## List owned games

```http
GET /games/mine
Cookie: indieforge_access=...
```

`200 OK` returns an array of the game-summary objects shown above, containing only games owned by the authenticated user:

```json
[{"id":"cmexamplegame1","slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","visibility":"DRAFT","accessMode":"GUEST_ALLOWED","moderationState":"CLEAR","createdAt":"2026-09-05T12:00:00.000Z","updatedAt":"2026-09-05T12:00:00.000Z"}]
```

## Discover public games

```http
GET /discover?query=orbit&limit=20
```

`200 OK`:

```json
{"games":[{"slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","developer":{"displayName":"Ava Buildwell"},"createdAt":"2026-09-05T12:00:00.000Z"}],"nextCursor":null}
```

`query` is optional and matches title or description without case sensitivity. `limit` defaults to 20 and is capped at 50. Pass a non-null `nextCursor` back as the `cursor` query parameter to fetch the next page. Only `PUBLIC` games with `CLEAR` moderation are returned.

## Look up a public game

```http
GET /games/by-slug/orbit-orchard
```

`200 OK`:

```json
{"slug":"orbit-orchard","title":"Orbit Orchard","description":"Grow fruit in zero gravity.","developer":{"displayName":"Ava Buildwell"},"createdAt":"2026-09-05T12:00:00.000Z"}
```

This response never includes the owner's email. Draft, unlisted, flagged, quarantined, or missing games return `404`. The current foundation has no publishing endpoint, so public records are shown here to document the read contract for public data that exists; publishing is planned work.
