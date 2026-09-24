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

VERSION="$(jq -er '.version' "$METADATA_FILE")"
WEB_REF="$(jq -er '.webImage' "$METADATA_FILE")"
API_REF="$(jq -er '.apiImage' "$METADATA_FILE")"
WEB_ID="$(jq -r '.webImageId // empty' "$METADATA_FILE")"
API_ID="$(jq -r '.apiImageId // empty' "$METADATA_FILE")"

# Never pass registry digest refs to Compose — they do not survive docker save/load.
WEB_IMAGE="platform-web:${VERSION}"
API_IMAGE="platform-api:${VERSION}"

ensure_local_tag() {
  local local_tag="$1"
  local image_id="$2"
  local source_ref="$3"

  if docker image inspect "$local_tag" >/dev/null 2>&1; then
    return 0
  fi
  if [ -n "$image_id" ] && docker image inspect "$image_id" >/dev/null 2>&1; then
    docker tag "$image_id" "$local_tag"
    return 0
  fi
  if docker image inspect "$source_ref" >/dev/null 2>&1; then
    docker tag "$source_ref" "$local_tag"
    return 0
  fi

  echo "Missing local image for $local_tag" >&2
  echo "  tried id=${image_id:-<none>} ref=${source_ref}" >&2
  docker images
  exit 1
}

# Free APP_PORT from Docker publishes and leftover host processes (node/vite preview).
free_host_port() {
  local port="$1"
  local ids=""
  local pids=""

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

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
    sleep 1
  fi

  pids="$(
    ss -tlnp 2>/dev/null | awk -v p=":"$port"$" '
      $4 ~ p {
        if (match($0, /pid=[0-9]+/)) print substr($0, RSTART+4, RLENGTH-4)
      }' | sort -u
  )"
  if [ -n "$pids" ]; then
    echo "Killing host process(es) on port ${port}: $(echo "$pids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .; then
      echo "Host port ${port} is still in use after cleanup:" >&2
      ss -tlnp "sport = :${port}" 2>/dev/null || ss -tln "sport = :${port}" 2>/dev/null || true
      echo "Stop the process above (often a leftover node preview) and re-run CD." >&2
      exit 1
    fi
  fi
}

ensure_local_tag "$WEB_IMAGE" "$WEB_ID" "$WEB_REF"
ensure_local_tag "$API_IMAGE" "$API_ID" "$API_REF"

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
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" run --rm --no-build api node src/migrate.js

echo "Deploying API and web images (${WEB_IMAGE}, ${API_IMAGE})..."
# Stop published web first, then free anything else still bound to APP_PORT.
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" rm -f web >/dev/null 2>&1 || true
free_host_port "$APP_PORT"
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans --no-build

echo "Running full-stack health checks..."
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

mv "$NEXT_ENV" "$CURRENT_ENV"
trap - EXIT
echo "Release ${VERSION} deployed successfully."
