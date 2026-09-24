#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"
APP_PORT="${APP_PORT:-4173}"

[ -f "$PREVIOUS_ENV" ] || { echo "No previous release metadata; rollback skipped."; exit 0; }

command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  cat <<'MSG' >&2
Docker Compose v2 is required (`docker compose`).
Re-run CD so the deploy workflow can bootstrap Compose over SSH if needed.
MSG
  exit 1
fi

if [ -f "$PREVIOUS_ENV" ]; then
  # shellcheck disable=SC1090
  APP_PORT="$(awk -F= '/^APP_PORT=/{print $2; exit}' "$PREVIOUS_ENV" || true)"
  APP_PORT="${APP_PORT:-4173}"
fi

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

echo "Rolling application containers back to previous image digests..."
# Database data and migrations are intentionally not rolled back.
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" up -d postgres --wait
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" rm -f web >/dev/null 2>&1 || true
free_host_port "$APP_PORT"
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans --no-build

curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "${DEPLOY_ROOT}/failed.env"
fi
cp "$PREVIOUS_ENV" "$CURRENT_ENV"
echo "Application rollback complete. PostgreSQL data was preserved."
