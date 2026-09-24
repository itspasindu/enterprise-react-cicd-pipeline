#!/usr/bin/env bash
# Copy the release bundle and both app images to the staging VM.
#
# Run 35959727408 saved both images by graphdriver image ID (the config digest).
# docker load printed one "Loaded image ID", then `docker tag` of
# sha256:f82158ba (platform-web's config digest) failed with "No such image".
# An untagged multi-image archive does not keep those IDs on a containerd
# image store, and load can report only one image. Save each name:tag to its
# own archive, require that tag in the tar, and require it on the VM before
# retagging. Release metadata is rewritten to platform-web/api:<version>.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/image-archive.sh
source "${SCRIPT_DIR}/lib/image-archive.sh"

: "${HOST:?HOST is required}"
: "${USER:?USER is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${API_IMAGE:?API_IMAGE is required}"
: "${LOCAL_WEB:?LOCAL_WEB is required}"
: "${LOCAL_API:?LOCAL_API is required}"
: "${VERSION:?VERSION is required}"
RELEASE_DIR="${RELEASE_DIR:-release}"

require_local_ref() {
  local label="$1"
  local ref="$2"
  case "$ref" in
    *@sha256:*|ghcr.io/*)
      echo "${label} must be a local name:tag, not a GHCR digest ref (${ref})" >&2
      exit 1
      ;;
  esac
  if [[ ! "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*:[A-Za-z0-9._-]+$ ]]; then
    echo "${label} must be a safe name:tag, got: ${ref}" >&2
    exit 1
  fi
}

require_local_ref "WEB_IMAGE" "$WEB_IMAGE"
require_local_ref "API_IMAGE" "$API_IMAGE"
require_local_ref "LOCAL_WEB" "$LOCAL_WEB"
require_local_ref "LOCAL_API" "$LOCAL_API"

if [ "$WEB_IMAGE" = "$API_IMAGE" ] || [ "$LOCAL_WEB" = "$LOCAL_API" ]; then
  echo "Web and API image refs must be different" >&2
  exit 1
fi
if [[ ! "$DEPLOY_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_ROOT must be a safe absolute path, got: ${DEPLOY_ROOT}" >&2
  exit 1
fi
if [ ! -f "${RELEASE_DIR}/release-metadata.json" ]; then
  echo "Missing ${RELEASE_DIR}/release-metadata.json" >&2
  exit 1
fi

known_hosts="${HOME}/.ssh/known_hosts"
if [ ! -f "$known_hosts" ]; then
  echo "Missing ${known_hosts}" >&2
  exit 1
fi

SSH=(ssh -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=${known_hosts}")
SCP=(scp -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=${known_hosts}")
REMOTE="${USER}@${HOST}"
# rsync splits -e on spaces; known_hosts lives under HOME and has no spaces on the runner.
RSYNC_RSH="ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts}"

docker image inspect "$WEB_IMAGE" >/dev/null
docker image inspect "$API_IMAGE" >/dev/null

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

save_checked_archive() {
  local ref="$1"
  local dest="$2"
  echo "Saving ${ref}"
  docker save -o "$dest" "$ref"
  if ! image_archive_contains_ref "$dest" "$ref"; then
    echo "Refusing to transfer ${ref}: docker save did not record that tag." >&2
    exit 1
  fi
  gzip -f "$dest"
}

save_checked_archive "$WEB_IMAGE" "${workdir}/web.tar"
save_checked_archive "$API_IMAGE" "${workdir}/api.tar"
ls -lh "${workdir}/web.tar.gz" "${workdir}/api.tar.gz"

echo "Syncing release bundle to ${DEPLOY_ROOT}"
"${SSH[@]}" "$REMOTE" "mkdir -p '${DEPLOY_ROOT}'"
rsync -az -e "$RSYNC_RSH" "${RELEASE_DIR}/" "${REMOTE}:${DEPLOY_ROOT}/"

remote_dir="${DEPLOY_ROOT}/.image-transfer"
"${SSH[@]}" "$REMOTE" "rm -rf '${remote_dir}' && mkdir -p '${remote_dir}'"
"${SCP[@]}" "${workdir}/web.tar.gz" "${workdir}/api.tar.gz" "${REMOTE}:${remote_dir}/"

"${SSH[@]}" "$REMOTE" \
  "REMOTE_DIR='${remote_dir}' WEB_IMAGE='${WEB_IMAGE}' API_IMAGE='${API_IMAGE}' LOCAL_WEB='${LOCAL_WEB}' LOCAL_API='${LOCAL_API}' bash -s" <<'EOF'
set -euo pipefail
trap 'rm -rf "$REMOTE_DIR"' EXIT
load_one() {
  local archive="$1"
  local ref="$2"
  local plain="${archive%.gz}"
  echo "Loading ${archive} for ${ref}"
  gzip -dc "$archive" > "$plain"
  docker load -i "$plain"
  if ! docker image inspect "$ref" >/dev/null 2>&1; then
    echo "VM is missing ${ref} after docker load." >&2
    docker images >&2 || true
    exit 1
  fi
  rm -f "$archive" "$plain"
}
load_one "${REMOTE_DIR}/web.tar.gz" "$WEB_IMAGE"
load_one "${REMOTE_DIR}/api.tar.gz" "$API_IMAGE"
docker tag "$WEB_IMAGE" "$LOCAL_WEB"
docker tag "$API_IMAGE" "$LOCAL_API"
docker image inspect "$LOCAL_WEB" >/dev/null
docker image inspect "$LOCAL_API" >/dev/null
echo "Retagged ${LOCAL_WEB} and ${LOCAL_API}"
EOF

WEB_ID="$("${SSH[@]}" "$REMOTE" "docker image inspect -f '{{.Id}}' '${LOCAL_WEB}'")"
API_ID="$("${SSH[@]}" "$REMOTE" "docker image inspect -f '{{.Id}}' '${LOCAL_API}'")"
WEB_ID="$(printf '%s' "$WEB_ID" | tr -d '[:space:]')"
API_ID="$(printf '%s' "$API_ID" | tr -d '[:space:]')"
if [[ ! "$WEB_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || [[ ! "$API_ID" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Unexpected image id after load (web=${WEB_ID}, api=${API_ID})" >&2
  exit 1
fi
SHA="$(jq -er '.sha' "${RELEASE_DIR}/release-metadata.json")"

jq -n \
  --arg version "$VERSION" \
  --arg sha "$SHA" \
  --arg web "$LOCAL_WEB" \
  --arg api "$LOCAL_API" \
  --arg webId "$WEB_ID" \
  --arg apiId "$API_ID" \
  --arg transferWeb "$WEB_IMAGE" \
  --arg transferApi "$API_IMAGE" \
  '{
    version: $version,
    sha: $sha,
    webImage: $web,
    apiImage: $api,
    webImageId: $webId,
    apiImageId: $apiId,
    transferWebImage: $transferWeb,
    transferApiImage: $transferApi
  }' > "${workdir}/release-metadata.json"

if jq -e '[(.webImage // ""), (.apiImage // "")] | any(test("@sha256:|^ghcr\\.io/"))' \
  "${workdir}/release-metadata.json" >/dev/null; then
  echo "Refusing to publish release metadata that still points at GHCR." >&2
  exit 1
fi

"${SCP[@]}" "${workdir}/release-metadata.json" "${REMOTE}:${DEPLOY_ROOT}/release-metadata.json"
remote_web="$("${SSH[@]}" "$REMOTE" "jq -er '.webImage' '${DEPLOY_ROOT}/release-metadata.json'")"
remote_api="$("${SSH[@]}" "$REMOTE" "jq -er '.apiImage' '${DEPLOY_ROOT}/release-metadata.json'")"
if [ "$remote_web" != "$LOCAL_WEB" ] || [ "$remote_api" != "$LOCAL_API" ]; then
  echo "VM metadata images are ${remote_web} and ${remote_api}; expected ${LOCAL_WEB} and ${LOCAL_API}" >&2
  exit 1
fi

echo "Staged ${LOCAL_WEB} (${WEB_ID}) and ${LOCAL_API} (${API_ID})"
