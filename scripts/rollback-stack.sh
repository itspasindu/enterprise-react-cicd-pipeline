#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"

[ -f "$PREVIOUS_ENV" ] || { echo "No previous release metadata; rollback skipped."; exit 0; }

command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  cat <<'MSG' >&2
Docker Compose v2 is required (`docker compose`), not the legacy `docker-compose` binary.

Ubuntu's default docker.io package does not ship docker-compose-plugin.
Install the Compose v2 CLI plugin:

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH=x86_64 ;;
    aarch64|arm64) ARCH=aarch64 ;;
    armv7l) ARCH=armv7 ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-${ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose version

Then re-run CD.
MSG
  exit 1
fi

echo "Rolling application containers back to previous image digests..."
# Database data and migrations are intentionally not rolled back.
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" up -d postgres --wait
docker compose --env-file "$PREVIOUS_ENV" -f "$COMPOSE_FILE" up -d api web --wait --remove-orphans

curl --fail --silent --show-error http://127.0.0.1:4173/api/ready >/dev/null
curl --fail --silent --show-error http://127.0.0.1:4173/ >/dev/null

if [ -f "$CURRENT_ENV" ]; then
  cp "$CURRENT_ENV" "${DEPLOY_ROOT}/failed.env"
fi
cp "$PREVIOUS_ENV" "$CURRENT_ENV"
echo "Application rollback complete. PostgreSQL data was preserved."
