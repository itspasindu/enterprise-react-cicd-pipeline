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

APP_PORT="$(awk -F= '/^APP_PORT=/{print $2; exit}' "$PREVIOUS_ENV" || true)"
APP_PORT="${APP_PORT:-4173}"

WEB_IMAGE="$(awk -F= '/^WEB_IMAGE=/{print $2; exit}' "$PREVIOUS_ENV")"
API_IMAGE="$(awk -F= '/^API_IMAGE=/{print $2; exit}' "$PREVIOUS_ENV")"

# Prefer config Ids from the previous release bundle (portable after docker load).
if [ -f "$PREVIOUS_RELEASE" ] && jq -e '.images.web.imageId' "$PREVIOUS_RELEASE" >/dev/null 2>&1; then
  WEB_IMAGE="$(jq -er '.images.web.imageId' "$PREVIOUS_RELEASE")"
  API_IMAGE="$(jq -er '.images.api.imageId' "$PREVIOUS_RELEASE")"
fi

is_immutable_runtime_ref() {
  local ref="${1:-}"
  [[ "$ref" =~ ^sha256:[a-f0-9]{64}$ ]]
}

if ! is_immutable_runtime_ref "$WEB_IMAGE" || ! is_immutable_runtime_ref "$API_IMAGE"; then
  echo "WARNING: previous release lacks portable image Ids (${WEB_IMAGE}, ${API_IMAGE})." >&2
  echo "Digest-enforced rollback cannot apply; leaving the current stack unchanged." >&2
  exit 0
fi

ROLLBACK_COMPOSE="$COMPOSE_FILE"
if [ -f "$PREVIOUS_COMPOSE" ]; then
  ROLLBACK_COMPOSE="$PREVIOUS_COMPOSE"
fi

docker image inspect "$WEB_IMAGE" >/dev/null
docker image inspect "$API_IMAGE" >/dev/null

ROLLBACK_ENV="$(mktemp "${DEPLOY_ROOT}/rollback.XXXXXX")"
trap 'rm -f "$ROLLBACK_ENV"' EXIT
# Force portable config Ids into the Compose env (previous.env may still hold tags or digest refs).
awk -v web="$WEB_IMAGE" -v api="$API_IMAGE" '
  BEGIN { web_set=0; api_set=0 }
  /^WEB_IMAGE=/ { print "WEB_IMAGE=" web; web_set=1; next }
  /^API_IMAGE=/ { print "API_IMAGE=" api; api_set=1; next }
  { print }
  END {
    if (!web_set) print "WEB_IMAGE=" web
    if (!api_set) print "API_IMAGE=" api
  }
' "$PREVIOUS_ENV" > "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"

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

echo "Rolling application containers back to previous immutable image Ids..."
echo "  web=${WEB_IMAGE}"
echo "  api=${API_IMAGE}"
docker compose --env-file "$ROLLBACK_ENV" -f "$ROLLBACK_COMPOSE" up -d postgres --wait
docker compose --env-file "$ROLLBACK_ENV" -f "$ROLLBACK_COMPOSE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$ROLLBACK_ENV" -f "$ROLLBACK_COMPOSE" rm -f web >/dev/null 2>&1 || true
free_host_port "$APP_PORT"
docker compose --env-file "$ROLLBACK_ENV" -f "$ROLLBACK_COMPOSE" up -d api web --wait --remove-orphans --no-build --pull never

verify_running_service_id "$ROLLBACK_COMPOSE" "$ROLLBACK_ENV" web "$WEB_IMAGE"
verify_running_service_id "$ROLLBACK_COMPOSE" "$ROLLBACK_ENV" api "$API_IMAGE"

curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "${DEPLOY_ROOT}/failed.env"
fi
cp "$ROLLBACK_ENV" "$CURRENT_ENV"
trap - EXIT
rm -f "$ROLLBACK_ENV"
if [ -f "$PREVIOUS_RELEASE" ]; then
  cp "$PREVIOUS_RELEASE" "${DEPLOY_ROOT}/release.json"
fi
if [ -f "$PREVIOUS_COMPOSE" ]; then
  cp "$PREVIOUS_COMPOSE" "$COMPOSE_FILE"
fi

echo "Application rollback complete. PostgreSQL data was preserved."
