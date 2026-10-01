#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
PREVIOUS_COMPOSE="${DEPLOY_ROOT}/previous-compose.yml"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"
PREVIOUS_RELEASE="${DEPLOY_ROOT}/previous-release.json"
APP_PORT="${APP_PORT:-4173}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/validate-image-ref.sh
source "${SCRIPT_DIR}/lib/validate-image-ref.sh"

[ -f "$PREVIOUS_ENV" ] || { echo "No previous release metadata; rollback skipped."; exit 0; }

command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  cat <<'MSG' >&2
Docker Compose v2 is required (`docker compose`).
Re-run CD so the deploy workflow can bootstrap Compose over SSH if needed.
MSG
  exit 1
fi
command -v jq >/dev/null || { echo "jq is required for digest rollback"; exit 1; }

# shellcheck disable=SC1090
APP_PORT="$(awk -F= '/^APP_PORT=/{print $2; exit}' "$PREVIOUS_ENV" || true)"
APP_PORT="${APP_PORT:-4173}"

WEB_IMAGE="$(awk -F= '/^WEB_IMAGE=/{print $2; exit}' "$PREVIOUS_ENV")"
API_IMAGE="$(awk -F= '/^API_IMAGE=/{print $2; exit}' "$PREVIOUS_ENV")"
validate_image_reference "$WEB_IMAGE"
validate_image_reference "$API_IMAGE"

if [ -f "$PREVIOUS_RELEASE" ]; then
  PREV_WEB="$(jq -er '.images.web.reference' "$PREVIOUS_RELEASE")"
  PREV_API="$(jq -er '.images.api.reference' "$PREVIOUS_RELEASE")"
  if [ "$WEB_IMAGE" != "$PREV_WEB" ] || [ "$API_IMAGE" != "$PREV_API" ]; then
    echo "previous.env WEB_IMAGE/API_IMAGE do not match previous-release.json" >&2
    exit 1
  fi
fi

ROLLBACK_COMPOSE="$COMPOSE_FILE"
if [ -f "$PREVIOUS_COMPOSE" ]; then
  ROLLBACK_COMPOSE="$PREVIOUS_COMPOSE"
fi
validate_compose_application_images "$ROLLBACK_COMPOSE" "$WEB_IMAGE" "$API_IMAGE"

docker image inspect "$WEB_IMAGE" >/dev/null
docker image inspect "$API_IMAGE" >/dev/null

free_host_port() {
  local port="$1"
  local ids=""
  ids="$(docker ps -aq --filter "publish=${port}" 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    ids="$(
      docker ps -aq --format '{{.ID}} {{.Ports}}' \
        | awk -v p=":${port}->" 'index($0, p) { print $1 }'
    )"
  fi
  if [ -n "$ids" ]; then
    echo "Freeing host port ${port}; removing container(s): $(echo "$ids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null
  fi
}

echo "Rolling application containers back to previous immutable digests..."
echo "  web=${WEB_IMAGE}"
echo "  api=${API_IMAGE}"
docker compose --env-file "$PREVIOUS_ENV" -f "$ROLLBACK_COMPOSE" up -d postgres --wait
docker compose --env-file "$PREVIOUS_ENV" -f "$ROLLBACK_COMPOSE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$PREVIOUS_ENV" -f "$ROLLBACK_COMPOSE" rm -f web >/dev/null 2>&1 || true
free_host_port "$APP_PORT"
docker compose --env-file "$PREVIOUS_ENV" -f "$ROLLBACK_COMPOSE" up -d api web --wait --remove-orphans --no-build --pull never

verify_running_service_digest "$ROLLBACK_COMPOSE" "$PREVIOUS_ENV" web "$WEB_IMAGE"
verify_running_service_digest "$ROLLBACK_COMPOSE" "$PREVIOUS_ENV" api "$API_IMAGE"

curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "${DEPLOY_ROOT}/failed.env"
fi
cp "$PREVIOUS_ENV" "$CURRENT_ENV"
if [ -f "$PREVIOUS_RELEASE" ]; then
  cp "$PREVIOUS_RELEASE" "${DEPLOY_ROOT}/release.json"
fi
if [ -f "$PREVIOUS_COMPOSE" ]; then
  cp "$PREVIOUS_COMPOSE" "$COMPOSE_FILE"
fi

echo "Application rollback complete. PostgreSQL data was preserved."
