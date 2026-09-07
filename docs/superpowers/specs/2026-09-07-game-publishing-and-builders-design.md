# Game Publishing And Builders Design

## Goal

Let authenticated creators make a game in one of three ways—upload an HTML5
ZIP, edit HTML/CSS/JavaScript, or use a no-code builder—then preview it, submit
it for moderator review, and publish approved games for visitors to play.

## Delivery phases

1. Add HTML5 ZIP upload, durable artifact storage, sandboxed play, submission,
   moderation, and publication.
2. Add an HTML/CSS/JavaScript editor that compiles into the same artifact
   format.
3. Add a no-code interactive-story/quiz builder.
4. Add a no-code 2D platformer builder.

Each phase produces a usable vertical slice and shares the storage, preview,
review, and public-player foundation from phase 1.

## Product behavior

### Creator flow

- `Create a game` asks for title, slug, description, access mode, and source
  type: `HTML5 ZIP`, `Code editor`, `Story / quiz`, or `2D platformer`.
- Creation opens `/studio/games/:id`, the owner-only workspace for that game.
- ZIP games accept one `.zip` of at most 25 MiB. It must contain a root
  `index.html`; absolute paths, traversal, symlinks, encrypted entries, and an
  expanded total over 100 MiB are rejected.
- Code games provide separate HTML, CSS, and JavaScript editors and a preview.
- Story games provide scenes with a stable identifier, speaker, dialogue,
  background color, and choices that target another scene. The builder checks
  duplicate/missing scene identifiers before preview or submission.
- Platformer games provide canvas dimensions, player start, goal, colors, and
  axis-aligned platforms. The generated runtime supports left/right movement,
  jumping, gravity, collision, restart, and reaching the goal.
- Saving project data keeps the game private. Preview always runs the most
  recently built artifact and never changes publication state.
- `Send for review` requires a valid built artifact. It changes review state
  from `DRAFT` or `REJECTED` to `PENDING` and locks publication, but the owner
  may continue editing; a subsequent edit/build returns it to `DRAFT`.
- A rejection displays the moderator note. The creator can edit and resubmit.

### Moderator flow

- Users with `MODERATOR` or `ADMIN` role see `Kiểm duyệt` in authenticated
  navigation and can open `/moderation`.
- The queue lists pending games with creator, metadata, source type, submission
  time, and a sandboxed preview.
- Approve changes review state to `APPROVED`, visibility to `PUBLIC`, and makes
  the game discoverable. Reject requires a 1–500 character note and returns
  visibility to `DRAFT`.
- Regular users receive 403 from moderation APIs even if they manually call
  them. UI visibility is convenience, not authorization.

### Player flow

- Discover continues to list only `PUBLIC`, moderation-clear games. Approved
  games link to a detail page with a `Play game` frame.
- `AUTH_REQUIRED` games require a valid session before the playable artifact is
  served. `GUEST_ALLOWED` games work without signing in.
- Missing, draft, rejected, quarantined, and unapproved artifacts are never
  served from the public play route.

## Data model

Add these fields to `Game`:

- `sourceType`: `UPLOAD`, `CODE`, `STORY`, or `PLATFORMER`.
- `reviewState`: `DRAFT`, `PENDING`, `APPROVED`, or `REJECTED`.
- `projectData`: nullable JSON containing editor/builder source only. Upload
  games keep this null.
- `artifactVersion`: integer incremented after each successful artifact build.
- `reviewNote`: nullable moderator rejection note.
- `submittedAt` and `reviewedAt`: nullable timestamps.

The existing `visibility` remains the public listing switch and the existing
`moderationState` remains the emergency safety/quarantine switch. Approval sets
`visibility=PUBLIC`; editing/building after approval resets it to `DRAFT` so an
unreviewed revision cannot replace a reviewed public game.

## Artifact storage and serving

- `GAME_STORAGE_ROOT` defaults to `/var/lib/indieforge/games` in production and
  a temporary/test path elsewhere. Production Compose mounts a named
  `game_storage` volume there.
- Each successful build is written to a private staging directory, validated,
  then atomically renamed to `<game-id>/<artifact-version>/`. Database state is
  updated only after publication of the directory succeeds. Failed staging is
  deleted; prior versions remain usable until the database points to the new
  version.
- Files are served through an API route that resolves and checks every path
  beneath the selected artifact directory. It sets `X-Content-Type-Options:
  nosniff`, a restrictive CSP, and no-store caching during preview.
- The web player embeds artifacts in an iframe with `sandbox="allow-scripts
  allow-pointer-lock"`, deliberately omitting `allow-same-origin`, forms,
  popups, top navigation, and downloads. Uploaded JavaScript therefore receives
  an opaque origin and cannot read IndieForge cookies or DOM.
- The public and authenticated app remain on the existing single origin. Game
  CSP allows only artifact-local images, audio, fonts, styles, scripts, and
  media; it blocks network connections, frames, objects, and form submission.

## API boundaries

- `POST /games` accepts the existing metadata plus `sourceType`.
- `GET /games/:id` returns an owner-only game workspace summary and project
  data.
- `PUT /games/:id/project` validates and saves code/story/platformer JSON.
- `POST /games/:id/upload` accepts multipart field `game` for upload games.
- `POST /games/:id/build` generates an artifact from saved builder source.
- `POST /games/:id/submit` moves a valid artifact to `PENDING`.
- `GET /games/:id/preview/*` serves the current artifact to its owner or a
  moderator.
- `GET /play/:slug/*` serves only approved public artifacts, enforcing the
  configured access mode.
- `GET /moderation/games` lists pending reviews for moderator/admin users.
- `POST /moderation/games/:id/approve` and `/reject` perform review transitions.

Mutating endpoints retain exact-origin CSRF enforcement. Multipart content is
accepted only for the authenticated upload route; all other mutations remain
JSON-only.

## Builder compilation

- Code source is wrapped into one `index.html`; raw `</script>` and `</style>`
  sequences are escaped so source cannot break the generated document shape.
- Story source compiles into a self-contained accessible HTML runtime with
  scene text and choice buttons. User strings are serialized as JSON, not
  interpolated into executable markup.
- Platformer source compiles into a self-contained canvas runtime. Numeric
  bounds are validated before generation and project data is serialized as
  JSON.
- Builders create no arbitrary server-side processes. Compilation is pure
  string/file generation and never executes creator code on the server.

## Validation and failure handling

- Ownership and role checks occur in services before storage access or state
  mutation.
- Upload validation has explicit compressed size, expanded size, entry count
  (maximum 1,000), path, and root-entry checks. Accepted suffixes are `.html`,
  `.css`, `.js`, `.mjs`, `.json`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`,
  `.svg`, `.wav`, `.mp3`, `.ogg`, `.mp4`, `.webm`, `.woff`, `.woff2`, and
  `.ttf`; extensionless files and all other suffixes are rejected. Failed
  uploads do not replace a working artifact.
- Project schemas have bounded strings and arrays so JSON bodies cannot become
  unbounded storage. Invalid graphs/coordinates return 400 with actionable
  messages.
- Storage failures return 503 without advancing artifact or review state.
- Review transitions use conditional database updates so two moderators cannot
  approve/reject the same pending revision inconsistently.

## Testing and release gates

- Contract tests cover source/project schemas and all limits.
- Unit tests cover ownership, role authorization, state transitions, generator
  escaping, story graph validation, platform collision data, ZIP validation,
  and safe path resolution.
- API E2E covers upload, preview access, edit/build reset, submit, unauthorized
  moderation, approve/reject, public access modes, and non-public denial.
- Browser E2E covers all three creation paths, preview, resubmission, moderator
  approval, discovery, public play, and creator-facing error messages.
- Deployment tests verify the durable volume, upload limit, health checks, and
  that API/database ports remain private.
- Moderator/admin role assignment remains an operator action against the
  existing user-role field and is documented in the deployment runbook; there
  is no public endpoint for granting elevated roles.
- Before public replacement: unit, typecheck, lint, API E2E, browser E2E,
  production build, Compose contract, backup, migration, health, and live
  browser journey must all pass.

## Explicit non-goals

- Executable/APK distribution, multiplayer/networked games, payments,
  comments, ratings, analytics, version history UI, collaborative editing,
  arbitrary engine imports, and AI generation are outside this release.
- The platformer builder is intentionally a small rectangular-platform editor,
  not a general-purpose physics engine or Unity/Godot replacement.
