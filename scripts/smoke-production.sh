#!/usr/bin/env bash

set -euo pipefail

smoke_dir="$(mktemp -d)"
cookie_jar="$smoke_dir/cookies.txt"
studio_file="$smoke_dir/studio.html"
export COMPOSE_PROJECT_NAME="indieforge-smoke-$$"

if ! docker info >/dev/null 2>&1; then
  docker() {
    sudo docker "$@"
  }
fi

cleanup() {
  local test_status=$?
  local down_status=0
  local remove_status=0

  trap - EXIT
  set +e
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$smoke_dir/.env.production" -f compose.production.yml down --volumes --remove-orphans
  down_status=$?
  rm -r "$smoke_dir"
  remove_status=$?

  if ((test_status == 0 && down_status != 0)); then
    test_status=$down_status
  elif ((test_status == 0 && remove_status != 0)); then
    test_status=$remove_status
  fi

  if ((test_status == 0)); then
    echo "cleanup: PASS ($COMPOSE_PROJECT_NAME removed with volumes)"
  else
    echo "cleanup: completed after failure ($COMPOSE_PROJECT_NAME)" >&2
  fi
  exit "$test_status"
}
trap cleanup EXIT

cat >"$smoke_dir/.env.production" <<'ENVIRONMENT'
DEPLOY_ADDRESS=:80
HTTP_PORT=8080
SITE_ORIGIN=http://localhost:8080
POSTGRES_DB=indieforge
POSTGRES_USER=indieforge
POSTGRES_PASSWORD=0123456789abcdef0123456789abcdef
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ENVIRONMENT

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$smoke_dir/.env.production" -f compose.production.yml "$@"
}

configured_project_name="$(
  compose config --format json \
    | node -e "let input = ''; process.stdin.on('data', (chunk) => input += chunk); process.stdin.on('end', () => process.stdout.write(JSON.parse(input).name));"
)"
if [[ "$configured_project_name" != "$COMPOSE_PROJECT_NAME" ]]; then
  echo "project isolation: FAIL (expected $COMPOSE_PROJECT_NAME, got $configured_project_name)" >&2
  exit 1
fi

diagnostics() {
  compose ps || true
  compose logs --no-color || true
}

if ! compose up -d --build --wait; then
  echo "stack startup: FAIL" >&2
  diagnostics
  exit 1
fi

health_response=''
health_deadline=$((SECONDS + 120))
until [[ "$health_response" == '{"status":"ok"}' ]]; do
  if ((SECONDS >= health_deadline)); then
    echo "health: FAIL (timed out after 120 seconds)" >&2
    diagnostics
    exit 1
  fi
  health_response="$(curl --silent --show-error --max-time 5 http://localhost:8080/api/health || true)"
  [[ "$health_response" == '{"status":"ok"}' ]] || sleep 2
done
echo "health: PASS"

registration_email="smoke-${COMPOSE_PROJECT_NAME}@example.com"
registration_response="$({
  curl --silent --show-error --fail-with-body \
    --cookie-jar "$cookie_jar" \
    --header 'Content-Type: application/json' \
    --header 'Origin: http://localhost:8080' \
    --data "{\"email\":\"$registration_email\",\"password\":\"smoke-password-123\"}" \
    http://localhost:8080/api/auth/register
})"
RESPONSE="$registration_response" EXPECTED_EMAIL="$registration_email" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const body = JSON.parse(process.env.RESPONSE);
assert.equal(body.email, process.env.EXPECTED_EMAIL);
NODE
echo "registration: PASS"

profile_name="Smoke Developer $$"
profile_response="$({
  curl --silent --show-error --fail-with-body \
    --cookie "$cookie_jar" \
    --header 'Content-Type: application/json' \
    --header 'Origin: http://localhost:8080' \
    --request PUT \
    --data "{\"displayName\":\"$profile_name\",\"bio\":\"Disposable production smoke profile.\"}" \
    http://localhost:8080/api/developers/me
})"
RESPONSE="$profile_response" EXPECTED_NAME="$profile_name" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const body = JSON.parse(process.env.RESPONSE);
assert.equal(body.displayName, process.env.EXPECTED_NAME);
NODE
echo "authenticated profile: PASS"

draft_slug="smoke-draft-$$"
draft_response="$({
  curl --silent --show-error --fail-with-body \
    --cookie "$cookie_jar" \
    --header 'Content-Type: application/json' \
    --header 'Origin: http://localhost:8080' \
    --data "{\"title\":\"Disposable smoke draft\",\"slug\":\"$draft_slug\",\"description\":\"Created by the production smoke journey.\",\"accessMode\":\"GUEST_ALLOWED\"}" \
    http://localhost:8080/api/games
})"
RESPONSE="$draft_response" EXPECTED_SLUG="$draft_slug" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const body = JSON.parse(process.env.RESPONSE);
assert.equal(body.slug, process.env.EXPECTED_SLUG);
assert.equal(body.visibility, 'DRAFT');
NODE
echo "authenticated draft: PASS"

owned_games_response="$(curl --silent --show-error --fail-with-body --cookie "$cookie_jar" http://localhost:8080/api/games/mine)"
RESPONSE="$owned_games_response" EXPECTED_SLUG="$draft_slug" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const body = JSON.parse(process.env.RESPONSE);
assert.ok(Array.isArray(body), 'owned games response must be an array');
assert.ok(body.some((game) => game.slug === process.env.EXPECTED_SLUG));
NODE
echo "owned games: PASS"

discovery_response="$(curl --silent --show-error --fail-with-body http://localhost:8080/api/discover)"
RESPONSE="$discovery_response" PRIVATE_SLUG="$draft_slug" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const body = JSON.parse(process.env.RESPONSE);
assert.ok(Array.isArray(body.games), 'discovery games must be an array');
assert.equal(typeof body.nextCursor === 'string' || body.nextCursor === null, true);
assert.ok(!body.games.some((game) => game.slug === process.env.PRIVATE_SLUG));
NODE
echo "private draft exclusion: PASS"

studio_status="$(
  curl --silent --show-error --fail-with-body \
    --cookie "$cookie_jar" \
    --output "$studio_file" \
    --write-out '%{http_code}' \
    http://localhost:8080/studio
)"
if [[ "$studio_status" != '200' ]]; then
  echo "SSR studio: FAIL (expected HTTP 200, got $studio_status)" >&2
  exit 1
fi
studio_html="$(<"$studio_file")"
RESPONSE="$studio_html" EXPECTED_NAME="$profile_name" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

assert.ok(process.env.RESPONSE.includes(process.env.EXPECTED_NAME));
NODE
echo "SSR studio: PASS"
