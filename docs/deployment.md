# TFG production deployment

This runbook operates one Linux host running Caddy, Next.js, the API, a one-shot Prisma migration job, and PostgreSQL 16. Run commands from the repository root in Bash. Replace the example repository URL, revision, hostname, and IP before running them.

## Host and network

Use an Ubuntu/Linux host with Git, OpenSSL, curl, Docker Engine, and the Docker Compose v2 plugin installed. Check `docker version` and `docker compose version`; the Compose version must support `up --wait`. Docker must be running. If your account requires elevated Docker access, use `sudo docker` in place of `docker` in every command and in the `compose` function below. Docker access grants host-level privileges. Node.js 22 and pnpm 10 are needed only for repository tests, not for running the built containers.

Reserve enough memory and disk for PostgreSQL, image builds, previous images, and backups. Monitor free disk with `df -h` and Docker usage with `docker system df`. Do not reclaim capacity by deleting database volumes.

Allow inbound TCP 80 and 443 in both the host firewall and provider firewall; UDP 443 enables HTTP/3. Keep the existing SSH access rule when changing the firewall. Only Caddy publishes application ports. Do not expose PostgreSQL 5432, API 3001, or web 3000. For a domain, point its DNS A record at the host's public IPv4 address. Add an AAAA record only if IPv6 reaches the same host and firewall rules permit it; remove stale records before certificate issuance. Caddy needs outbound network access for certificates and the host needs access to image/package registries during builds.

## Prepare an explicit release

```bash
git clone '<repository-url>' indieforge
cd indieforge
git fetch --tags origin
git checkout --detach '<commit-or-tag>'
git rev-parse HEAD
umask 077
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -hex 32
```

Paste the first independently generated value into `POSTGRES_PASSWORD` and the second into `JWT_SECRET`. Keep `POSTGRES_PASSWORD` hexadecimal: Compose inserts it directly into a connection URL, so punctuation in an arbitrary password can break authentication. Use simple database/user names such as the provided `indieforge`. Keep the environment file out of Git, tickets, logs, and shared terminals. Do not run full `compose config` in shared logs because it renders secrets.

For HTTPS, set these values in `.env.production`:

```dotenv
DEPLOY_ADDRESS=games.example.com
HTTP_PORT=80
SITE_ORIGIN=https://games.example.com
COOKIE_SECURE=true
```

For a temporary bare-IP HTTP preview, use the host's actual public IP in place of `203.0.113.10`:

```dotenv
DEPLOY_ADDRESS=:80
HTTP_PORT=80
SITE_ORIGIN=http://203.0.113.10
COOKIE_SECURE=false
```

`SITE_ORIGIN` is the exact browser origin, including scheme and any non-default port, with no trailing slash. For example, publishing `HTTP_PORT=8080` requires `SITE_ORIGIN=http://203.0.113.10:8080`. `DEPLOY_ADDRESS=:80` is the listener inside Caddy, regardless of that host port. HTTP transmits passwords and session cookies without encryption; use disposable preview accounts. `COOKIE_SECURE=false` is an explicit HTTP preview exception. Production otherwise defaults to secure cookies; when moving to HTTPS, set it back to `true` and sign in again. Do not use the HTTP override for a public HTTPS release.

Pin the Compose project name so deployments from a different checkout keep using the same volumes. Define this function again when opening a new shell:

```bash
compose() {
  docker compose --project-name indieforge --env-file .env.production -f compose.production.yml "$@"
}
compose config --quiet
```

Unset any exported variables that would override `.env.production`, especially `POSTGRES_PASSWORD`, `JWT_SECRET`, `COOKIE_SECURE`, and the origin/address settings. Shell environment overrides the environment file. Never use the local `docker-compose.yml` for this deployment.

## AdSense build configuration

Keep the current test deployment at `NEXT_PUBLIC_ADSENSE_ENABLED=false`, with
empty IDs. The web image receives all four public build arguments from Compose:

```dotenv
NEXT_PUBLIC_ADSENSE_ENABLED=false
NEXT_PUBLIC_ADSENSE_CLIENT=
NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT=
NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT=
```

The enable flag must be exactly `true`, the client must match `^ca-pub-\d+$`,
and both slots must match `^\d+$` before the adapter renders an AdSense script
or ad element. Missing or malformed values disable it. Disabled slots display
`Quảng cáo` placeholders and make no Google request, even when valid IDs are
present. These values are public and compiled into the web image: rebuild and
recreate web after changing them; setting runtime environment variables alone
does not update the browser bundle.

CSP must be deliberately expanded and reviewed before enabling real AdSense.
Validate the required script, frame, image, and connection origins against the
provider's current requirements; valid IDs alone are not release approval.
Preserve the executable game's sandbox and CSP. This release neither enables
real ads nor adds Google origins to game-content policy.

## Start and verify

```bash
compose up -d --build --wait
compose ps -a
compose logs --no-color migrate
```

The migration job must exit 0. PostgreSQL must be healthy before migrations run, and API startup waits for successful migrations. A migration failure stops API startup; inspect its logs and resolve it before continuing. The web and API must be healthy and the proxy running. For HTTPS, allow Caddy to obtain the certificate and inspect `compose logs proxy` if issuance fails.

Set a non-secret shell variable to the same origin as the environment file, then check the public route:

```bash
PUBLIC_ORIGIN=https://games.example.com
# HTTP preview alternative: PUBLIC_ORIGIN=http://203.0.113.10
curl --fail --show-error --connect-timeout 5 --max-time 30 "$PUBLIC_ORIGIN/api/health"
```

Expect `{"status":"ok"}`. In a browser at that origin, register a disposable account, save a developer profile, reload `/studio`, create a draft, build a small code/story/platformer game, confirm its sandboxed preview works, and sign out and back in. A direct `/studio` reload must retain the session. Send a built game for review, then use a separately granted moderator account to approve or reject it. Only approved, moderation-clear public games are discoverable; drafts and unreviewed artifacts remain private.

### TFG desktop acceptance

Check 1280×720, 1440×900, and 1920×1080 in light and dark themes. The brand is
`TFG`, and navigation, account forms, Studio, moderation, and player controls
use Vietnamese. Home presents all four creation methods; Discover shows real
covers or a deterministic 16:9 fallback. Narrow windows collapse the player
sidebars below the game; dedicated mobile interaction is outside this release.

The `Giao diện` control cycles `system` → `light` → `dark`. The default follows
the operating system, including system changes while the page is open. Manual
selection persists across navigation and reload in local storage (`tfg-theme`).
If storage is unavailable, the control still works for the current page.

At each desktop size, the entire three-column player must fit below the header:
two disabled ad slots on the left, the game in the center, and up to six related
games excluding the current slug on the right. Confirm the iframe has
`scrolling="no"` and `sandbox="allow-scripts allow-pointer-lock"`. Verify a
non-16:9 viewport as well as the default 16×9: the game retains its declared
ratio without stretching or cropping. Click `Mở toàn màn hình`, then
`Thoát toàn màn hình` (and also test Escape); the same iframe and game state
must survive with an unchanged URL and no reload. Unsupported/rejected
fullscreen displays an accessible Vietnamese status. In browser network logs,
there must be zero requests to `googlesyndication.com` or `doubleclick.net`.

### Cover upload and persistence

Routes below are API-relative; the public proxy adds `/api`:

```text
POST /games/:id/cover             owner multipart upload (cover)
GET  /games/:id/cover/:version    authenticated owner preview
GET  /covers/:slug/:version       approved public cover
```

Upload exactly one multipart file named `cover`, with no additional fields.
JPEG, PNG, and WebP are accepted up to and including 5 MiB (5,242,880 bytes);
the declared MIME type must match its detected signature. SVG, GIF, malformed
signatures, and MIME mismatches return `400`; oversized uploads return `413`.
Signature checks do not perform full image decoding or malware scanning.
Authentication, ownership, and same-origin protections remain required. A
successful upload returns the updated game summary with an incremented
`coverVersion` and `coverContentType`. Cover-only changes preserve the review
state. Changing viewport metadata with `PATCH /games/:id` resets pending or
approved games to a draft, so resubmit and approve before public verification.

Owner reads are `private, no-store`; public reads require a `PUBLIC`, `CLEAR`,
`APPROVED` game and use versioned immutable caching. Both return the image MIME
type and `X-Content-Type-Options: nosniff`; only the current positive cover
version is readable at the origin; previously fetched immutable responses may
remain cached after a later change. Test a draft's owner preview, an anonymous denial, and a
public cover after approval. See [API examples](api/foundation.md#game-covers).

The API writes covers atomically under
`GAME_STORAGE_ROOT/covers/<game-id>/<version>/cover` with adjacent
`.indieforge-cover.json` metadata. They share `game_storage` with HTML5
artifacts, with sealed `0444` files and `0555` version directories, but are
served only through the cover controller as image bytes. Do not register
`covers/` as executable game artifacts or expose it through Caddy/Next.js static
hosting. Back up the entire root, including hidden metadata. On a validation
stack, record artifact/cover counts and SHA-256, restart only API, and confirm
identical bytes plus successful game play and public cover reads.

From a checkout with dependencies and Playwright Chromium installed, the same account journey can target this stack:

```bash
read -r -p 'Disposable moderator email: ' E2E_MODERATOR_EMAIL
read -r -s -p 'Disposable moderator password: ' E2E_MODERATOR_PASSWORD; printf '\n'
export E2E_EXTERNAL_SERVICES=1 E2E_WEB_URL="$PUBLIC_ORIGIN"
export E2E_MODERATOR_EMAIL E2E_MODERATOR_PASSWORD
pnpm --filter web e2e
unset E2E_MODERATOR_EMAIL E2E_MODERATOR_PASSWORD
```

Register the disposable account first, grant it `MODERATOR` with the operator-only function below, and use credentials created solely for this run. If either moderator variable is omitted, the external moderation journey is skipped; the local harness alone supplies its documented deterministic defaults. After verification, revoke the role (or delete the disposable account and its test data through an audited operator procedure) and unset both variables. Never reuse or commit production credentials. This creates real test records; the fixture-dependent public discovery test is skipped. See [browser setup](../apps/web/README.md#verify). The separate `pnpm test:deploy-smoke` creates and deletes a disposable Compose project and its volumes; run it on a validation host with free ports 8080 and 443, not alongside this production proxy.

## Routine operations

```bash
compose ps -a
compose logs --tail=100 api web proxy
compose logs --follow --tail=100 api
compose restart api web
compose stop
compose up -d --wait
```

`restart` does not apply changed environment variables or new images; use `up -d --build --wait` for those changes. `stop` preserves containers and data. `compose down` removes containers and networks but retains named volumes. Never run `down --volumes`, `down -v`, or volume pruning against this production project: these delete the database, game artifacts, covers, and Caddy state. The matching commands in the development guide and smoke script are exclusively for disposable data.

## Back up

Run before every upgrade or restore, and on a regular schedule. Database rows and
their HTML5 artifacts and cover directories are one recovery unit: take the
database and entire game-storage root while API and web writes are stopped,
record the same revision, and restore them together. The `.artifacts.tar.gz`
filename includes `covers/` and its metadata, not just executable artifacts.
This Bash function leaves `.partial` files on failure and publishes each member
of a timestamped pair only after both archives validate:

```bash
backup_release() (
  set -e
  umask 077
  mkdir -p backups
  chmod 700 backups
  backup_prefix="backups/$(date -u +%Y%m%dT%H%M%S)-$$"
  database_backup="$backup_prefix.database.dump"
  artifact_backup="$backup_prefix.artifacts.tar.gz"

  # API is the single writer of game_storage. Stop only services that were
  # running when this backup started, then use `start` to revive those exact
  # existing containers. `up` could otherwise reconcile a newly built image.
  running_services=()
  for service in api web; do
    if test -n "$(compose ps --status running -q "$service")"; then
      running_services+=("$service")
    fi
  done
  restore_initial_state() {
    local status=$?
    trap - EXIT
    if ((${#running_services[@]})); then
      compose start "${running_services[@]}" || {
        printf 'Could not restart the original services: %s\n' "${running_services[*]}" >&2
        test "$status" -ne 0 || status=1
      }
    fi
    exit "$status"
  }
  trap restore_initial_state EXIT
  if ((${#running_services[@]})); then
    compose stop "${running_services[@]}"
  fi
  compose \
    exec -T postgres sh -c 'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    > "$database_backup.partial"
  compose run --rm --no-deps --entrypoint sh api -c \
    'exec tar -C /var/lib/indieforge/games -czf - .' \
    > "$artifact_backup.partial"
  compose exec -T postgres pg_restore --list < "$database_backup.partial" > /dev/null
  tar -tzf "$artifact_backup.partial" > /dev/null
  mv "$database_backup.partial" "$database_backup"
  mv "$artifact_backup.partial" "$artifact_backup"
  sha256sum -- "$database_backup" "$artifact_backup" > "$backup_prefix.sha256.partial"
  sha256sum --check --status "$backup_prefix.sha256.partial"
  mv "$backup_prefix.sha256.partial" "$backup_prefix.sha256"
  printf 'Database backup: %s\nArtifact backup: %s\n' "$database_backup" "$artifact_backup"
  printf 'SHA-256 manifest: %s\n' "$backup_prefix.sha256"
  git rev-parse HEAD
)
backup_release
```

If the function fails, it restarts only services that were running on entry;
investigate the error and do not deploy from an unvalidated pair. Record the
revision alongside both files in operations records. The database dump includes
application data and Prisma migration history, while the artifact archive is a
tar stream of the entire private `game_storage` named volume, including covers
and hidden image metadata. Keep the owner-only `.sha256` manifest with both
archives and verify it before restore. Its paths are relative to the checkout;
preserve the recorded filenames and run verification from the repository root.
Neither archive includes cluster roles or `.env.production`. Keep encrypted
off-host copies, restrict access to
both backups and secrets, define retention, monitor scheduled backup failures,
and regularly test restores into an isolated database. A local backup alone
will not survive host loss.

## Restore with explicit confirmation

A restore replaces database contents, game artifacts, and covers, discarding
changes since the chosen backup pair. First make a fresh backup using the
previous section, identify its revision and the revision compatible with the
pair to restore, and verify the target project. Do not run an upgrade or a
second operator session concurrently. Use trusted archives only: database dumps
and tar archives can contain executable restore instructions or unsafe paths.

`pg_restore --clean` only removes objects present in the archive; it does not remove tables or other objects introduced by later migrations. Exact recovery therefore requires a clean target database. The function below validates the archive and displays the actual target before asking for typed confirmation. It stops API, web, and the migration job, drops only the configured application database, recreates it from `template0`, and restores the archive in one transaction. It refuses the PostgreSQL maintenance/template database names.

Dropping the database cannot be rolled back with the restore transaction. The
artifact archive is first extracted and validated in a hidden staging directory
inside the API-only volume; a malformed or unsafe archive therefore fails after
services stop but before the database is dropped. A later database restore
failure leaves an empty database and applications stopped; recover using the
chosen dump or fresh safety backup. A failed migration-status check also leaves
the restored database and applications stopped. Review the failure before
retrying; the proxy may return 502 while services are stopped. This procedure
restores database objects and data, not cluster roles or separately managed
database-level grants/settings. If you manage extra database-level
grants/settings, add their reapplication after `createdb` and before the
function proceeds to restore and restart.

```bash
restore_database() {
  local backup_file="$1"
  local artifact_file="${2:-}"
  local checksum_file="${3:-}"
  local confirmation
  local target_database
  local restore_token="restore-$(date -u +%Y%m%dT%H%M%S)-$$"
  stage_artifacts() {
    compose run --rm --no-deps --entrypoint sh api -ec '
      root=/var/lib/indieforge/games
      stage="$root/.$1.stage"
      test -d "$root" && test ! -L "$root" && test ! -e "$stage" || exit 1
      mkdir "$stage"
      cleanup() { find -P "$stage" -xdev -depth -type f -exec chmod u+rw -- {} + 2>/dev/null || true; find -P "$stage" -xdev -depth -type d -exec chmod u+rwx -- {} + 2>/dev/null || true; rm -rf -- "$stage"; }
      trap cleanup EXIT
      tar -C "$stage" --no-same-owner --same-permissions -xzf -
      if find -P "$stage" -xdev \( -type l -o ! -type d ! -type f \) -print -quit | grep -q .; then
        printf "Artifact archive contains a disallowed entry.\n" >&2
        exit 1
      fi
      trap - EXIT
    ' sh "$restore_token" < "$artifact_file"
  }
  replace_artifacts() {
    compose run --rm --no-deps --entrypoint sh api -ec '
      root=/var/lib/indieforge/games
      stage="$root/.$1.stage"
      previous="$root/.$1.old"
      test -d "$root" && test ! -L "$root" && test -d "$stage" && test ! -e "$previous" || exit 1
      mkdir "$previous"
      for entry in "$root"/* "$root"/.[!.]* "$root"/..?*; do
        test -e "$entry" || continue
        test "$entry" = "$stage" && continue
        test "$entry" = "$previous" && continue
        mv -- "$entry" "$previous/"
      done
      for entry in "$stage"/* "$stage"/.[!.]* "$stage"/..?*; do
        test -e "$entry" || continue
        mv -- "$entry" "$root/"
      done
      rmdir "$stage"
    ' sh "$restore_token"
  }
  discard_previous_artifacts() {
    compose run --rm --no-deps --entrypoint sh api -ec '
      root=/var/lib/indieforge/games
      previous="$root/.$1.old"
      case "$previous" in "$root"/.restore-*.old) ;; *) exit 1 ;; esac
      test -d "$previous" && test ! -L "$previous" || exit 1
      find -P "$previous" -xdev -depth -type f -exec chmod u+rw -- {} +
      find -P "$previous" -xdev -depth -type d -exec chmod u+rwx -- {} +
      rm -rf -- "$previous"
    ' sh "$restore_token"
  }
  test -s "$backup_file" || return 1
  test -z "$artifact_file" || test -s "$artifact_file" || return 1
  if test -n "$checksum_file"; then
    test -n "$artifact_file" && test -s "$checksum_file" || return 1
    # Compare exactly this pair, including filenames, before stopping services.
    (set -o pipefail; sha256sum -- "$backup_file" "$artifact_file" | cmp -s -- "$checksum_file" -) || {
      printf 'Backup checksum or filename mismatch.\n' >&2
      return 1
    }
  fi
  compose ps -a || return 1
  compose exec -T postgres pg_restore --list < "$backup_file" > /dev/null || return 1
  test -z "$artifact_file" || tar -tzf "$artifact_file" > /dev/null || return 1
  target_database="$(compose exec -T postgres sh -c 'printf "%s" "$POSTGRES_DB"' < /dev/null)" || return 1
  case "$target_database" in
    ''|postgres|template0|template1) printf 'Refusing maintenance/empty database target.\n' >&2; return 1 ;;
  esac
  printf 'DROP/recreate database %s and replace game artifacts and covers in project indieforge? Type RESTORE: ' "$target_database"
  read -r confirmation
  test "$confirmation" = RESTORE || return 1
  compose stop api web migrate || return 1
  if test -n "$artifact_file"; then
    # Extract and validate first. A bad artifact archive must fail before the
    # database is dropped or the live artifact tree is replaced.
    stage_artifacts || return 1
  fi
  compose exec -T postgres sh -ec '
    dropdb --force --username="$POSTGRES_USER" -- "$POSTGRES_DB"
    createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" --template=template0 -- "$POSTGRES_DB"
  ' || return 1
  if test -n "$artifact_file"; then
    # This runs as API's node user. It only moves children of the exact mounted
    # root, so sealed 0555 artifact versions never need in-place deletion.
    replace_artifacts || return 1
  fi
  compose exec -T postgres sh -c \
    'exec pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    < "$backup_file" || return 1
  compose run --rm --no-deps migrate pnpm --filter @indieforge/database prisma migrate status || return 1
  if test -n "$artifact_file"; then
    discard_previous_artifacts || printf 'Preserved prior artifact tree in game_storage for manual cleanup.\n' >&2
  fi
  compose up -d --wait || return 1
}
restore_database 'backups/<timestamp>.database.dump' 'backups/<timestamp>.artifacts.tar.gz' 'backups/<timestamp>.sha256'
```

The second argument is required for a complete application recovery; omitting it
is only appropriate for a deliberate database-only operator repair. Pass the
third argument for all backups made by this runbook; a checksum or filename
mismatch aborts before services stop or data changes. The optional third
argument retains compatibility with legacy pairs whose integrity was verified
separately. SHA-256 detects changed bytes; it does not authenticate an untrusted
archive. The artifact replacement occurs only after typed confirmation, with API/web
stopped. It moves only direct children of the exact `game_storage` mount, so
version directories restored with their sealed `0555` permissions never require
in-place deletion; the prior tree is removed only after database migration
verification. The Docker volume itself is never deleted. Before calling this
function, ensure the checkout and built images
match the restored database's application revision. The migration-status check
must confirm that this release's committed migration history matches the
restored database before `up` can restart the application. Restoring an old
backup pair while leaving incompatible newer images in place is not a rollback.
After success, repeat migration logs, service health, and browser verification
from the start section.

To regression-test the documented functions on a validation host, run `node scripts/test-deployment-runbook.mjs` and `node scripts/test-restore-runbook.mjs` with Docker access and the `postgres:16-alpine` image already present. They archive and restore sealed HTML5 files and a cover at `covers/game-id/1/cover`, comparing SHA-256 for both image bytes and metadata. The restore drill uses an isolated, unpublished PostgreSQL container, proves post-backup tables and later artifact/cover versions are removed, and checks checksum, confirmation, and failure handling. Application lifecycle and migration-status outcomes are controlled by the harness; archive operations, the dump, database recreation, restore, and SQL assertions are real. Each drill removes its container and temporary files even on failure.

## Moderator role assignment

Roles are assigned only by an operator with PostgreSQL access; no public API
can elevate a user. The function prompts for the email and a typed confirmation
instead of placing the address in shell history. It changes exactly the matching
user and prints the returned email/role so a missing account is visible.

```bash
grant_moderator() {
  local email confirmation
  read -r -p 'Existing account email to grant MODERATOR: ' email
  test -n "$email" || return 1
  printf 'Grant MODERATOR to %s in project indieforge? Type GRANT: ' "$email"
  read -r confirmation
  test "$confirmation" = GRANT || return 1
  # The email travels on stdin. PostgreSQL variables and the SQL file are
  # resolved inside the container, so host environment variables cannot alter
  # the target database and apostrophes remain safely quoted by psql.
  printf '%s\n' "$email" | compose exec -T postgres sh -ec '
    IFS= read -r email
    psql --set=ON_ERROR_STOP=1 --set="email=$email" \
      --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --file=/dev/stdin <<'"'"'SQL'"'"'
UPDATE "User"
SET "role" = '"'"'MODERATOR'"'"'
WHERE "email" = :'"'"'email'"'"'
RETURNING "email", "role";
SQL
  '
}
grant_moderator
```

Sign out and back in after an elevation so navigation updates. Use `ADMIN` only
when the broader administrative role is actually required.

After an external E2E run, revoke the disposable account immediately with the
same stdin-only targeting pattern (then remove the account through the normal
audited account-retention procedure if one exists):

```bash
revoke_moderator() {
  local email confirmation
  read -r -p 'Disposable moderator email to revoke: ' email
  test -n "$email" || return 1
  printf 'Revoke MODERATOR from %s in project indieforge? Type REVOKE: ' "$email"
  read -r confirmation
  test "$confirmation" = REVOKE || return 1
  printf '%s\n' "$email" | compose exec -T postgres sh -ec '
    IFS= read -r email
    psql --set=ON_ERROR_STOP=1 --set="email=$email" \
      --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --file=/dev/stdin <<'"'"'SQL'"'"'
UPDATE "User"
SET "role" = '"'"'USER'"'"'
WHERE "email" = :'"'"'email'"'"' AND "role" = '"'"'MODERATOR'"'"'
RETURNING "email", "role";
SQL
  '
}
revoke_moderator
```

## Upgrade

Schedule a maintenance window; this is a single-host deployment with downtime during migration. Save the current revision (`git rev-parse HEAD`) and a verified database/artifact backup pair before changing code. Review release notes and migrations for compatibility and restore requirements. Ensure `git status --short` is clean; keep `.env.production` and the project name in place.

After the backup completes, execute these commands in order, stopping on any failure:

```bash
git fetch --tags origin
git checkout --detach '<new-commit-or-tag>'
compose config --quiet
compose build
compose stop api web
compose rm -f migrate
compose up -d --build --wait
compose logs --no-color migrate
compose ps -a
curl --fail --show-error --connect-timeout 5 --max-time 30 "$PUBLIC_ORIGIN/api/health"
```

Removing only the stopped one-shot migration container ensures the migration job executes again even if its image was reused. Never remove its database volume. If startup or migration fails, keep the maintenance window open and inspect logs; do not prune images or backups. After successful health and browser checks, observe the release before reclaiming old images. Keep prior release images through the rollback window; `docker image prune` can delete dangling images needed for a quick rollback. Delay pruning and inspect `docker image ls` before removing explicitly identified obsolete image IDs. Rebuilding an older Git revision also requires working registry access.

## Roll back

Prisma production migrations are not automatically reversed by a Git checkout or `migrate deploy`. Determine whether the current database schema is compatible with the previous application version before restarting that version.

For a compatible database, stop API/web, check out the recorded revision, rebuild, and start it:

```bash
compose stop api web
git checkout --detach '<previous-commit-or-tag>'
compose config --quiet
compose build
compose rm -f migrate
compose up -d --wait
```

For an incompatible migration, keep API/web stopped, make a fresh safety backup pair, check out and build the previous revision as above, and remove the stopped migration container. Then call `restore_database` with the verified pre-upgrade database and artifact archives. Its explicit confirmation and success check control restart. This restores database state, artifact bytes, and migration history together; it also loses writes made after that pair. Repeat health and browser verification and retain the failed-release backup for investigation. Do not edit `_prisma_migrations` or invent reverse migrations as an emergency shortcut.

## Persistent state, rotation, and availability

The `indieforge_postgres_data` volume holds PostgreSQL data.
`indieforge_game_storage` holds immutable uploaded and compiled game artifacts
plus versioned image covers and their metadata, and is mounted only into the
single API process. `indieforge_caddy_data` stores
certificates and private keys; `indieforge_caddy_config` stores Caddy
configuration state. Preserve all four across restarts and upgrades. Repeatedly
deleting certificate state forces reissuance and can hit certificate-authority
limits. Protect certificate/artifact backups as sensitive data, and keep
independent copies of deployment configuration and environment through your
secret-management process.

Changing `JWT_SECRET` and recreating the API invalidates existing sessions; users must sign in again. Coordinate this with the maintenance window. Changing `POSTGRES_PASSWORD` in `.env.production` alone does not rotate an existing database role: the PostgreSQL image initializes credentials only on an empty data volume. Stop API/web, change the role password inside PostgreSQL using a secure administrative session, update the protected environment file to the same new hexadecimal value, and recreate the API/migration services before health checks. Avoid passwords in command arguments or shell history. Changing the origin also requires API recreation; switching from HTTP to HTTPS requires secure cookies and a fresh login.

One host and one database provide no automatic failover, rolling deployment guarantee, or point-in-time recovery. Host loss, disk exhaustion, restarts, and migrations can interrupt service. Define recovery objectives around tested off-host backups, monitor uptime/disk/certificate renewal, and plan replication and additional hosts separately if those limits are unacceptable.
