#!/usr/bin/env bash
# Copy the immutable release bundle and both app images to the staging VM.
# Images are transferred by digest reference (name@sha256:...); never mutable tags.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/image-archive.sh
source "${SCRIPT_DIR}/lib/image-archive.sh"
# shellcheck source=lib/validate-image-ref.sh
source "${SCRIPT_DIR}/lib/validate-image-ref.sh"

: "${HOST:?HOST is required}"
: "${USER:?USER is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${API_IMAGE:?API_IMAGE is required}"
: "${VERSION:?VERSION is required}"
RELEASE_DIR="${RELEASE_DIR:-release}"

validate_image_reference "$WEB_IMAGE"
validate_image_reference "$API_IMAGE"

if [ "$WEB_IMAGE" = "$API_IMAGE" ]; then
  echo "Web and API image refs must be different" >&2
  exit 1
fi
if [[ ! "$DEPLOY_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_ROOT must be a safe absolute path, got: ${DEPLOY_ROOT}" >&2
  exit 1
fi
if [ ! -f "${RELEASE_DIR}/release.json" ]; then
  echo "Missing ${RELEASE_DIR}/release.json" >&2
  exit 1
fi
if [ ! -f "${RELEASE_DIR}/checksums.txt" ]; then
  echo "Missing ${RELEASE_DIR}/checksums.txt" >&2
  exit 1
fi

(
  cd "$RELEASE_DIR"
  sha256sum -c checksums.txt
)

EXPECTED_WEB="$(jq -er '.images.web.reference' "${RELEASE_DIR}/release.json")"
EXPECTED_API="$(jq -er '.images.api.reference' "${RELEASE_DIR}/release.json")"
EXPECTED_VERSION="$(jq -er '.version' "${RELEASE_DIR}/release.json")"
if [ "$VERSION" != "$EXPECTED_VERSION" ]; then
  echo "VERSION (${VERSION}) does not match release.json (${EXPECTED_VERSION})" >&2
  exit 1
fi
if [ "$WEB_IMAGE" != "$EXPECTED_WEB" ] || [ "$API_IMAGE" != "$EXPECTED_API" ]; then
  echo "Transfer refs must match release.json references" >&2
  echo "  expected web=${EXPECTED_WEB} api=${EXPECTED_API}" >&2
  echo "  got      web=${WEB_IMAGE} api=${API_IMAGE}" >&2
  exit 1
fi

validate_compose_application_images "${RELEASE_DIR}/compose.yml" "$EXPECTED_WEB" "$EXPECTED_API"

known_hosts="${HOME}/.ssh/known_hosts"
if [ ! -f "$known_hosts" ]; then
  echo "Missing ${known_hosts}" >&2
  exit 1
fi

SSH=(ssh -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=${known_hosts}")
SCP=(scp -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=${known_hosts}")
REMOTE="${USER}@${HOST}"
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
  if [ ! -s "$dest" ]; then
    echo "Refusing to transfer empty archive for ${ref}" >&2
    exit 1
  fi
  if [[ "$ref" != *@sha256:* ]]; then
    if ! image_archive_contains_ref "$dest" "$ref"; then
      echo "Refusing to transfer ${ref}: docker save did not record that tag." >&2
      exit 1
    fi
  fi
  gzip -f "$dest"
}

save_checked_archive "$WEB_IMAGE" "${workdir}/web.tar"
save_checked_archive "$API_IMAGE" "${workdir}/api.tar"
ls -lh "${workdir}/web.tar.gz" "${workdir}/api.tar.gz"

echo "Syncing immutable release bundle to ${DEPLOY_ROOT}"
"${SSH[@]}" "$REMOTE" "mkdir -p '${DEPLOY_ROOT}'"
"${SSH[@]}" "$REMOTE" "if [ -f '${DEPLOY_ROOT}/release.json' ]; then cp '${DEPLOY_ROOT}/release.json' '${DEPLOY_ROOT}/previous-release.json'; fi"
"${SSH[@]}" "$REMOTE" "if [ -f '${DEPLOY_ROOT}/compose.yml' ]; then cp '${DEPLOY_ROOT}/compose.yml' '${DEPLOY_ROOT}/previous-compose.yml'; fi"
rsync -az -e "$RSYNC_RSH" "${RELEASE_DIR}/" "${REMOTE}:${DEPLOY_ROOT}/"

"${SSH[@]}" "$REMOTE" "cd '${DEPLOY_ROOT}' && sha256sum -c checksums.txt"

remote_dir="${DEPLOY_ROOT}/.image-transfer"
"${SSH[@]}" "$REMOTE" "rm -rf '${remote_dir}' && mkdir -p '${remote_dir}'"
"${SCP[@]}" "${workdir}/web.tar.gz" "${workdir}/api.tar.gz" "${REMOTE}:${remote_dir}/"

"${SSH[@]}" "$REMOTE" \
  "REMOTE_DIR='${remote_dir}' WEB_IMAGE='${WEB_IMAGE}' API_IMAGE='${API_IMAGE}' bash -s" <<'EOF'
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
echo "Loaded ${WEB_IMAGE} and ${API_IMAGE}"
EOF

remote_web_ref="$("${SSH[@]}" "$REMOTE" "jq -er '.images.web.reference' '${DEPLOY_ROOT}/release.json'")"
remote_api_ref="$("${SSH[@]}" "$REMOTE" "jq -er '.images.api.reference' '${DEPLOY_ROOT}/release.json'")"
if [ "$remote_web_ref" != "$EXPECTED_WEB" ] || [ "$remote_api_ref" != "$EXPECTED_API" ]; then
  echo "VM release.json digests diverged from the CI bundle" >&2
  exit 1
fi

echo "Staged immutable release ${VERSION}"
echo "  web=${WEB_IMAGE}"
echo "  api=${API_IMAGE}"
