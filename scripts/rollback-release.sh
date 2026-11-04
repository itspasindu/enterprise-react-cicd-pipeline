#!/usr/bin/env bash
# Point current at the previous release directory and restart. Database data is not restored.
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/platform}"
PORT="${PORT:-4173}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-process.sh
source "${SCRIPT_DIR}/lib/host-process.sh"

PREVIOUS="${DEPLOY_ROOT}/previous-release.json"
if [ ! -f "$PREVIOUS" ]; then
  echo "No previous release metadata; rollback skipped."
  exit 0
fi

directory="$(jq -er '.directory // empty' "$PREVIOUS")"
if [ -z "$directory" ] || [ ! -d "$directory" ]; then
  echo "Previous release directory is not on this host; rollback skipped."
  exit 0
fi

ln -sfn "$directory" "${DEPLOY_ROOT}/current"
echo "Restored $(jq -r '.version' "$PREVIOUS") ($(jq -r '.commit' "$PREVIOUS"))"
start_release_process "$DEPLOY_ROOT"
wait_until_ready "http://127.0.0.1:${PORT}/api/ready"
