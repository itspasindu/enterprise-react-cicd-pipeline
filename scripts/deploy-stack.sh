#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
EGRESS_OVERRIDE="${DEPLOY_ROOT}/compose.egress.yml"
RELEASE_JSON="${DEPLOY_ROOT}/release.json"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"
POSTGRES_DB="${POSTGRES_DB:-platform}"
POSTGRES_USER="${POSTGRES_USER:-platform}"
APP_PORT="${APP_PORT:-4173}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/validate-image-ref.sh
source "${SCRIPT_DIR}/lib/validate-image-ref.sh"
# shellcheck source=lib/compose-egress.sh
source "${SCRIPT_DIR}/lib/compose-egress.sh"

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
[ -f "$RELEASE_JSON" ] || { echo "Missing $RELEASE_JSON"; exit 1; }
[ -f "${DEPLOY_ROOT}/checksums.txt" ] || { echo "Missing ${DEPLOY_ROOT}/checksums.txt"; exit 1; }

echo "Verifying release bundle integrity..."
(
  cd "$DEPLOY_ROOT"
  sha256sum -c checksums.txt
)

VERSION="$(jq -er '.version' "$RELEASE_JSON")"
COMMIT="$(jq -er '.commit' "$RELEASE_JSON")"
WEB_REF="$(jq -er '.images.web.reference' "$RELEASE_JSON")"
API_REF="$(jq -er '.images.api.reference' "$RELEASE_JSON")"
WEB_IMAGE="$(jq -er '.images.web.imageId' "$RELEASE_JSON")"
API_IMAGE="$(jq -er '.images.api.imageId' "$RELEASE_JSON")"

# Prefer Ids observed after docker load on this host (config digests may rewrite).
RUNTIME_IMAGES="${DEPLOY_ROOT}/runtime-images.env"
if [ -f "$RUNTIME_IMAGES" ]; then
  RUNTIME_WEB="$(awk -F= '/^WEB_IMAGE=/{print $2; exit}' "$RUNTIME_IMAGES")"
  RUNTIME_API="$(awk -F= '/^API_IMAGE=/{print $2; exit}' "$RUNTIME_IMAGES")"
  if [ -n "$RUNTIME_WEB" ] && [ -n "$RUNTIME_API" ]; then
    WEB_IMAGE="$RUNTIME_WEB"
    API_IMAGE="$RUNTIME_API"
    echo "Using runtime image Ids from ${RUNTIME_IMAGES}"
  fi
fi

if [[ ! "$COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release.json commit must be a full SHA" >&2
  exit 1
fi

validate_image_reference "$WEB_REF"
validate_image_reference "$API_REF"
validate_image_id "$WEB_IMAGE"
validate_image_id "$API_IMAGE"
validate_release_compose_placeholders "$COMPOSE_FILE"

ensure_image_present() {
  local ref="$1"
  if docker image inspect "$ref" >/dev/null 2>&1; then
    return 0
  fi
  echo "Missing local image for ${ref} (transfer/load must provide release imageId)" >&2
  docker images
  exit 1
}

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

ensure_image_present "$WEB_IMAGE"
ensure_image_present "$API_IMAGE"

mkdir -p "$DEPLOY_ROOT"
if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "$PREVIOUS_ENV"
fi

write_compose_egress_override "$DEPLOY_ROOT"

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
WEB_DIGEST_REF=${WEB_REF}
API_DIGEST_REF=${API_REF}
RELEASE_VERSION=${VERSION}
RELEASE_COMMIT=${COMMIT}
GITHUB_TOKEN=${GITHUB_TOKEN:-}
GITHUB_OWNER=${GITHUB_OWNER:-}
GITHUB_REPO=${GITHUB_REPO:-}
EOF
chmod 600 "$NEXT_ENV"

compose() {
  docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" "$@"
}

if [ -z "${GITHUB_TOKEN:-}" ] || [ -z "${GITHUB_OWNER:-}" ] || [ -z "${GITHUB_REPO:-}" ]; then
  echo "WARNING: GITHUB_TOKEN/OWNER/REPO incomplete — /api/pipelines/* (except status) will return 503" >&2
fi

echo "Starting PostgreSQL for release ${VERSION} (commit ${COMMIT})..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" up -d postgres --wait

echo "Applying forward-only database migrations..."
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" run --rm --pull never api node src/migrate.js

echo "Deploying API and web by immutable image Id (from GHCR digests)..."
echo "  web ref=${WEB_REF}"
echo "  web id =${WEB_IMAGE}"
echo "  api ref=${API_REF}"
echo "  api id =${API_IMAGE}"
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" stop web >/dev/null 2>&1 || true
docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" rm -f web >/dev/null 2>&1 || true
free_host_port "$APP_PORT"
# Force-recreate API so dns/extra_hosts from compose.egress.yml always apply.
if ! docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" up -d api web --wait --remove-orphans --no-build --pull never --force-recreate; then
  echo "Compose up failed; freeing port ${APP_PORT} and retrying once" >&2
  free_host_port "$APP_PORT"
  docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" up -d api web --wait --remove-orphans --no-build --pull never --force-recreate
fi

verify_running_service_id "$COMPOSE_FILE" "$NEXT_ENV" web "$WEB_IMAGE" "$EGRESS_OVERRIDE"
verify_running_service_id "$COMPOSE_FILE" "$NEXT_ENV" api "$API_IMAGE" "$EGRESS_OVERRIDE"

echo "Running full-stack health checks..."
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/" >/dev/null

if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "Probing GitHub API egress from the API container..."
  if ! docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" exec -T api \
    wget -qO- --timeout=10 https://api.github.com/zen >/dev/null; then
    echo "ERROR: API container cannot reach https://api.github.com (DNS/egress)." >&2
    echo "Check that the API is on the egress network and the VM allows outbound HTTPS." >&2
    docker compose --env-file "$NEXT_ENV" -f "$COMPOSE_FILE" -f "$EGRESS_OVERRIDE" exec -T api \
      sh -ec 'cat /etc/resolv.conf; getent hosts api.github.com || true; wget -S -O- --timeout=10 https://api.github.com/zen || true' >&2 || true
    exit 1
  fi
  echo "GitHub API egress: OK"
fi

mv "$NEXT_ENV" "$CURRENT_ENV"
trap - EXIT
echo "Release ${VERSION} (commit ${COMMIT}) deployed successfully."
