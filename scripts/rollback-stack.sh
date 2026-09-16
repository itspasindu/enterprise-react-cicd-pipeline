#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.yml"
CURRENT_ENV="${DEPLOY_ROOT}/current.env"
PREVIOUS_ENV="${DEPLOY_ROOT}/previous.env"

[ -f "$PREVIOUS_ENV" ] || { echo "No previous release metadata; rollback skipped."; exit 0; }

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
