# Production deployment

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

Expect `{"status":"ok"}`. In a browser at that origin, register a disposable account, save a developer profile, reload `/studio`, create a draft, confirm it remains absent from discovery, and sign out and back in. A direct `/studio` reload must retain the session. Only existing public games are discoverable; this release cannot publish drafts.

From a checkout with dependencies and Playwright Chromium installed, the same account journey can target this stack:

```bash
E2E_EXTERNAL_SERVICES=1 E2E_WEB_URL="$PUBLIC_ORIGIN" pnpm --filter web e2e
```

This creates real test records; the fixture-dependent public discovery test is skipped. See [browser setup](../apps/web/README.md#verify). The separate `pnpm test:deploy-smoke` creates and deletes a disposable Compose project and its volumes; run it on a validation host with free ports 8080 and 443, not alongside this production proxy.

## Routine operations

```bash
compose ps -a
compose logs --tail=100 api web proxy
compose logs --follow --tail=100 api
compose restart api web
compose stop
compose up -d --wait
```

`restart` does not apply changed environment variables or new images; use `up -d --build --wait` for those changes. `stop` preserves containers and data. `compose down` removes containers and networks but retains named volumes. Never run `down --volumes`, `down -v`, or volume pruning against this production project: these delete the database and Caddy state. The matching commands in the development guide and smoke script are exclusively for disposable data.

## Back up

Run before every upgrade or restore, and on a regular schedule. This Bash subshell leaves a `.partial` file on failure and publishes a timestamped dump only after `pg_dump` succeeds:

```bash
(
  set -e
  umask 077
  mkdir -p backups
  chmod 700 backups
  backup_file="backups/$(date -u +%Y%m%dT%H%M%S)-$$.dump"
  docker compose --project-name indieforge --env-file .env.production -f compose.production.yml \
    exec -T postgres sh -c 'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    > "$backup_file.partial"
  mv "$backup_file.partial" "$backup_file"
  compose exec -T postgres pg_restore --list < "$backup_file" > /dev/null
  printf 'Backup: %s\n' "$backup_file"
  git rev-parse HEAD
)
```

Record the revision alongside the backup in your operations records. The dump includes application data and the Prisma migration history, but not PostgreSQL cluster roles or `.env.production`. Keep an encrypted off-host copy, restrict access to both backups and secrets, define retention, monitor scheduled backup failures, and regularly test restores into an isolated database. A local backup alone will not survive host loss. Archive validated dumps even if a later deployment fails.

## Restore with explicit confirmation

A restore replaces database contents and discards changes since the chosen backup. First make a fresh backup using the previous section, identify its revision and the revision compatible with the dump to restore, and verify the target project. Do not run an upgrade or a second operator session concurrently. Use a trusted custom-format dump; a dump can contain executable database commands.

This function validates the archive, asks for a typed confirmation, stops the API and web to prevent writes, and uses a transaction. A failed restore returns without restarting them. Review the failure before retrying; the proxy may return 502 while services are stopped.

```bash
restore_database() {
  local backup_file="$1"
  local confirmation
  test -s "$backup_file" || return 1
  compose ps -a || return 1
  compose exec -T postgres pg_restore --list < "$backup_file" > /dev/null || return 1
  printf 'Replace the indieforge database with %s? Type RESTORE: ' "$backup_file"
  read -r confirmation
  test "$confirmation" = RESTORE || return 1
  compose stop api web || return 1
  compose exec -T postgres sh -c \
    'exec pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    < "$backup_file" || return 1
  compose up -d --wait || return 1
}
restore_database 'backups/<timestamp>.dump'
```

Before calling this function, ensure the checkout and built images match the restored database's application revision. `up` may run pending migrations, so restoring an old dump while leaving incompatible newer images in place is not a rollback. After success, repeat migration logs, service health, and browser verification from the start section.

## Upgrade

Schedule a maintenance window; this is a single-host deployment with downtime during migration. Save the current revision (`git rev-parse HEAD`) and a verified backup path before changing code. Review release notes and migrations for compatibility and restore requirements. Ensure `git status --short` is clean; keep `.env.production` and the project name in place.

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

For an incompatible migration, keep API/web stopped, make a fresh safety backup, check out and build the previous revision as above, and remove the stopped migration container. Then call `restore_database` with the verified pre-upgrade dump. Its explicit confirmation and success check control restart. This restores the database and migration history together; it also loses writes made after that dump. Repeat health and browser verification and retain the failed-release backup for investigation. Do not edit `_prisma_migrations` or invent reverse migrations as an emergency shortcut.

## Persistent state, rotation, and availability

The `indieforge_postgres_data` volume holds PostgreSQL data. `indieforge_caddy_data` stores certificates and private keys; `indieforge_caddy_config` stores Caddy configuration state. Preserve all three across restarts and upgrades. Repeatedly deleting certificate state forces reissuance and can hit certificate-authority limits. Protect certificate backups as secrets, and keep independent copies of the deployment configuration and environment through your secret-management process.

Changing `JWT_SECRET` and recreating the API invalidates existing sessions; users must sign in again. Coordinate this with the maintenance window. Changing `POSTGRES_PASSWORD` in `.env.production` alone does not rotate an existing database role: the PostgreSQL image initializes credentials only on an empty data volume. Stop API/web, change the role password inside PostgreSQL using a secure administrative session, update the protected environment file to the same new hexadecimal value, and recreate the API/migration services before health checks. Avoid passwords in command arguments or shell history. Changing the origin also requires API recreation; switching from HTTP to HTTPS requires secure cookies and a fresh login.

One host and one database provide no automatic failover, rolling deployment guarantee, or point-in-time recovery. Host loss, disk exhaustion, restarts, and migrations can interrupt service. Define recovery objectives around tested off-host backups, monitor uptime/disk/certificate renewal, and plan replication and additional hosts separately if those limits are unacceptable.
