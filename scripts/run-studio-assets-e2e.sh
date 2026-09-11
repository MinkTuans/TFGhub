#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Run the Task 19 studio-assets.spec.ts browser integration lane.

The lane provisions an isolated PostgreSQL 16 container and temporary asset
storage, migrates the database, starts the real API and web applications, and
runs Playwright. Docker, curl, Node.js 22 and pnpm 10 are required.

Usage: pnpm test:e2e:studio-assets

Optional ports: TASK19_API_PORT, TASK19_WEB_PORT, TASK19_DATABASE_PORT.
EOF
  exit 0
fi

task19_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task19_root"

for task19_command in docker curl pnpm; do
  if ! command -v "$task19_command" >/dev/null 2>&1; then
    echo "Task 19 E2E requires $task19_command." >&2
    exit 1
  fi
done

task19_api_port="${TASK19_API_PORT:-3211}"
task19_web_port="${TASK19_WEB_PORT:-3210}"
task19_db_port="${TASK19_DATABASE_PORT:-55439}"
task19_container="tfg-task19-assets-${PPID}-$$"
task19_storage="$(mktemp -d "${TMPDIR:-/tmp}/tfg-task19-assets.XXXXXX")"
task19_api_log="$task19_storage/api.log"
task19_web_log="$task19_storage/web.log"
task19_api_pid=""
task19_web_pid=""

task19_cleanup() {
  task19_status=$?
  if [[ -n "$task19_web_pid" ]]; then kill "$task19_web_pid" 2>/dev/null || true; fi
  if [[ -n "$task19_api_pid" ]]; then kill "$task19_api_pid" 2>/dev/null || true; fi
  docker rm -f "$task19_container" >/dev/null 2>&1 || true
  if [[ $task19_status -ne 0 ]]; then
    [[ -f "$task19_api_log" ]] && { echo "--- API log ---" >&2; tail -100 "$task19_api_log" >&2; }
    [[ -f "$task19_web_log" ]] && { echo "--- Web log ---" >&2; tail -100 "$task19_web_log" >&2; }
  fi
  # Production storage deliberately seals content-addressed directories. This
  # temporary root is owned by the lane, so restore owner write permission
  # before removing it.
  chmod -R u+w "$task19_storage" 2>/dev/null || true
  find "$task19_storage" -depth -delete
  exit "$task19_status"
}
trap task19_cleanup EXIT INT TERM

docker run --detach --rm \
  --name "$task19_container" \
  --publish "127.0.0.1:${task19_db_port}:5432" \
  --env POSTGRES_DB=task19 \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD=task19 \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$task19_container" pg_isready -U postgres -d task19 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$task19_container" pg_isready -U postgres -d task19 >/dev/null

task19_database_url="postgresql://postgres:task19@127.0.0.1:${task19_db_port}/task19?schema=public"
DATABASE_URL="$task19_database_url" pnpm db:generate
DATABASE_URL="$task19_database_url" \
  pnpm --filter @indieforge/database prisma migrate deploy
DATABASE_URL="$task19_database_url" pnpm --filter api build

env \
  DATABASE_URL="$task19_database_url" \
  JWT_SECRET="task19-browser-tests-only-explicit-long-secret" \
  API_PORT="$task19_api_port" \
  WEB_ORIGIN="http://127.0.0.1:${task19_web_port}" \
  GAME_STORAGE_ROOT="$task19_storage/assets" \
  node apps/api/dist/main.js >"$task19_api_log" 2>&1 &
task19_api_pid=$!

env \
  API_INTERNAL_URL="http://127.0.0.1:${task19_api_port}" \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:${task19_api_port}" \
  NEXT_PUBLIC_ADSENSE_ENABLED=false \
  pnpm --filter web dev --hostname 127.0.0.1 --port "$task19_web_port" \
  >"$task19_web_log" 2>&1 &
task19_web_pid=$!

for task19_url in \
  "http://127.0.0.1:${task19_api_port}/health" \
  "http://127.0.0.1:${task19_web_port}/"; do
  task19_ready=0
  for _ in $(seq 1 120); do
    if curl --fail --silent --show-error "$task19_url" >/dev/null 2>&1; then
      task19_ready=1
      break
    fi
    sleep 1
  done
  if [[ $task19_ready -ne 1 ]]; then
    echo "Timed out waiting for $task19_url" >&2
    exit 1
  fi
done

env \
  E2E_EXTERNAL_SERVICES=1 \
  E2E_STUDIO_ASSETS=1 \
  E2E_WEB_URL="http://127.0.0.1:${task19_web_port}" \
  E2E_API_URL="http://127.0.0.1:${task19_api_port}" \
  pnpm --filter web exec playwright test e2e/studio-assets.spec.ts
