#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
METADATA_FILE="${DEPLOY_ROOT}/release-metadata.json"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"
POSTGRES_DB="${POSTGRES_DB:-platform}"
POSTGRES_USER="${POSTGRES_USER:-platform}"
APP_PORT="${APP_PORT:-4173}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  cat <<'MSG' >&2
Docker Compose v2 is required (`docker compose`).

If this host has no outbound DNS/GitHub access, re-run CD — the deploy workflow
bootstraps Compose into ~/.docker/cli-plugins/ over SSH from the Actions runner.
MSG
  exit 1
fi
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "Missing $COMPOSE_FILE"; exit 1; }
[ -f "$METADATA_FILE" ] || { echo "Missing $METADATA_FILE"; exit 1; }

WEB_IMAGE="$(jq -er '.webImage' "$METADATA_FILE")"
API_IMAGE="$(jq -er '.apiImage' "$METADATA_FILE")"
VERSION="$(jq -er '.version' "$METADATA_FILE")"

docker image inspect "$WEB_IMAGE" >/dev/null
docker image inspect "$API_IMAGE" >/dev/null

mkdir -p "$DEPLOY_ROOT"
if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "$PREVIOUS_ENV"
fi

NEXT_ENV="$(mktemp "${DEPLOY_ROOT}/release.XXXXXX")"
trap 'rm -f "$NEXT_ENV"' EXIT
cat > "$NEXT_ENV" <<EOF
COMPOSE_PROJECT_NAME=platform
APP_PORT=${APP_PORT}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
WEB_IMAGE=${WEB_IMAGE}
API_IMAGE=${API_IMAGE}
RELEASE_VERSION=${VERSION}
EOF
chmod 600 "$NEXT_ENV"

echo "Starting PostgreSQL..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d postgres --wait

echo "Applying forward-only database migrations..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" run --rm api node src/migrate.js

echo "Deploying API and web images by digest..."
CONFLICTING_CONTAINERS="$(
  docker ps --format '{{.ID}} {{.Ports}}' \
    | awk -v port="$APP_PORT" '$0 ~ ("[[:space:]](0\\.0\\.0\\.0|\\[::\\]|::):" port "->") { print $1 }'
)"
if [ -n "$CONFLICTING_CONTAINERS" ]; then
  echo "Found containers using host port ${APP_PORT}; removing them before deploy."
  echo "$CONFLICTING_CONTAINERS" | xargs -r docker rm -f >/dev/null
fi
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans

echo "Running full-stack health checks..."
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

mv "$NEXT_ENV" "$CURRENT_ENV"
trap - EXIT
echo "Release ${VERSION} deployed successfully."
