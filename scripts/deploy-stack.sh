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

# Docker platform-web is the only process that should bind APP_PORT.
# Stop a leftover Node/Vite preview (and its user systemd unit) with no delay,
# then return so the caller can run compose up immediately.
free_host_port() {
  local port="$1"
  local ids="" pid="" unit=""

  ids="$(docker ps -aq --filter "publish=${port}" 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    echo "Removing container(s) publishing ${port}"
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null
  fi

  if ! command -v ss >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
    return 0
  fi

  while read -r pid; do
    [ -n "$pid" ] || continue
    unit="$(systemctl --user status "$pid" --no-pager 2>/dev/null | awk 'NR==1 { gsub(/●/,""); print $1; exit }' || true)"
    if [ -n "$unit" ] && [[ "$unit" == *.service ]]; then
      echo "Stopping user service ${unit} (was holding port ${port})"
      systemctl --user stop "$unit" 2>/dev/null || true
      systemctl --user disable "$unit" 2>/dev/null || true
    fi
    echo "Stopping host process ${pid} on port ${port}"
    kill -9 "$pid" 2>/dev/null || true
  done < <(
    ss -tlnp 2>/dev/null | awk -v p=":${port}$" '
      $4 ~ p && match($0, /pid=[0-9]+/) {
        print substr($0, RSTART+4, RLENGTH-4)
      }'
  )
  fuser -k "${port}/tcp" 2>/dev/null || true
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
GITHUB_TOKEN=${GITHUB_TOKEN:-}
GITHUB_OWNER=${GITHUB_OWNER:-}
GITHUB_REPO=${GITHUB_REPO:-}
EOF
chmod 600 "$NEXT_ENV"

if [ -z "${GITHUB_TOKEN:-}" ] || [ -z "${GITHUB_OWNER:-}" ] || [ -z "${GITHUB_REPO:-}" ]; then
  echo "WARNING: GITHUB_TOKEN/OWNER/REPO incomplete — /api/pipelines/* (except status) will return 503" >&2
fi

echo "Starting PostgreSQL..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d postgres --wait

echo "Applying forward-only database migrations..."
# The Compose plugin CD installs (reusable-deploy.yml COMPOSE_VERSION, v2.32.4)
# accepts --no-build on `up` and `create` only. `run --no-build` exits 16 with
# "unknown flag: --no-build" before migrate.js starts. `run --pull never` is
# supported: ensure_local_tag already required API_IMAGE on this host, and
# pull_policy=never is not "build", so v2.32.4 skips rebuilding that image.
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" run --rm --pull never api node src/migrate.js

echo "Deploying API and web images (${WEB_IMAGE}, ${API_IMAGE})..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" rm -f web >/dev/null 2>&1 || true
# Free 4173 in the same moment as compose up. An earlier kill lets a Node
# preview respawn during Postgres/migrations and steal the port again.
free_host_port "$APP_PORT"
if ! docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans --no-build; then
  echo "Compose up failed; freeing port ${APP_PORT} and retrying once" >&2
  free_host_port "$APP_PORT"
  docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans --no-build
fi

echo "Running full-stack health checks..."
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

mv "$NEXT_ENV" "$CURRENT_ENV"
trap - EXIT
echo "Release ${VERSION} deployed successfully."
