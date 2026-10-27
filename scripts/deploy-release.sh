#!/usr/bin/env bash
# Install a checksummed release directory and restart the host API.
# Required: POSTGRES_PASSWORD
# Optional: DEPLOY_ROOT RELEASE_DIR POSTGRES_USER POSTGRES_DB PORT
#           GITHUB_TOKEN GITHUB_OWNER GITHUB_REPO STAGING_URL
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
RELEASE_DIR="${RELEASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
POSTGRES_USER="${POSTGRES_USER:-platform}"
POSTGRES_DB="${POSTGRES_DB:-platform}"
PORT="${PORT:-4173}"
STAGING_URL="${STAGING_URL:-http://127.0.0.1:${PORT}}"

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-process.sh
source "${SCRIPT_DIR}/lib/host-process.sh"

command -v node >/dev/null || { echo "node is required on the host" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required on the host" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required on the host" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required on the host" >&2; exit 1; }

[ -f "${RELEASE_DIR}/release.json" ] || { echo "Missing release.json" >&2; exit 1; }
[ -f "${RELEASE_DIR}/checksums.txt" ] || { echo "Missing checksums.txt" >&2; exit 1; }
[ -f "${RELEASE_DIR}/web/index.html" ] || { echo "Missing web/index.html" >&2; exit 1; }
[ -f "${RELEASE_DIR}/api/package.json" ] || { echo "Missing api/package.json" >&2; exit 1; }

echo "Verifying release checksums..."
(
  cd "$RELEASE_DIR"
  sha256sum -c checksums.txt
)

VERSION="$(jq -er '.version' "${RELEASE_DIR}/release.json")"
COMMIT="$(jq -er '.commit' "${RELEASE_DIR}/release.json")"
NAME="${VERSION}-${COMMIT}"
DEST="${DEPLOY_ROOT}/releases/${NAME}"

mkdir -p "${DEPLOY_ROOT}/releases"
if [ ! -d "$DEST" ]; then
  mkdir -p "$DEST"
  tar -C "$RELEASE_DIR" -cf - . | tar -C "$DEST" -xf -
fi

CURRENT_LINK="${DEPLOY_ROOT}/current"
if [ -L "$CURRENT_LINK" ] || [ -d "$CURRENT_LINK" ]; then
  previous="$(readlink -f "$CURRENT_LINK" || true)"
  if [ -n "${previous}" ] && [ "$previous" != "$DEST" ] && [ -f "${previous}/release.json" ]; then
    jq -c --arg directory "$previous" '. + {directory: $directory}' "${previous}/release.json" \
      > "${DEPLOY_ROOT}/previous-release.json"
  fi
fi

ln -sfn "$DEST" "$CURRENT_LINK"

DATABASE_URL="$(
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  POSTGRES_USER="$POSTGRES_USER" \
  POSTGRES_DB="$POSTGRES_DB" \
  node -e 'const p=process.env.POSTGRES_PASSWORD; const u=process.env.POSTGRES_USER; const d=process.env.POSTGRES_DB; process.stdout.write(`postgres://${encodeURIComponent(u)}:${encodeURIComponent(p)}@127.0.0.1:5432/${encodeURIComponent(d)}`);'
)"

umask 077
{
  printf 'NODE_ENV=%q\n' production
  printf 'PORT=%q\n' "$PORT"
  printf 'WEB_ROOT=%q\n' "${CURRENT_LINK}/web"
  printf 'DATABASE_URL=%q\n' "$DATABASE_URL"
  printf 'GITHUB_TOKEN=%q\n' "${GITHUB_TOKEN:-}"
  printf 'GITHUB_OWNER=%q\n' "${GITHUB_OWNER:-}"
  printf 'GITHUB_REPO=%q\n' "${GITHUB_REPO:-}"
  printf 'STAGING_URL=%q\n' "$STAGING_URL"
} > "${DEPLOY_ROOT}/current.env"
chmod 600 "${DEPLOY_ROOT}/current.env"

install -m 0755 "${DEST}/deploy-release.sh" "${DEPLOY_ROOT}/deploy-release.sh"
install -m 0755 "${DEST}/rollback-release.sh" "${DEPLOY_ROOT}/rollback-release.sh"
install -m 0755 "${DEST}/lib/host-process.sh" "${DEPLOY_ROOT}/lib/host-process.sh"
if [ -f "${DEST}/health-check.sh" ]; then
  install -m 0755 "${DEST}/health-check.sh" "${DEPLOY_ROOT}/health-check.sh"
fi

echo "Applying migrations for ${VERSION} (${COMMIT})"
(
  set -a
  # shellcheck disable=SC1091
  source "${DEPLOY_ROOT}/current.env"
  set +a
  cd "${CURRENT_LINK}/api"
  node src/migrate.js
)

start_release_process "$DEPLOY_ROOT"
wait_until_ready "http://127.0.0.1:${PORT}/api/ready"
echo "Deployed ${NAME}"
