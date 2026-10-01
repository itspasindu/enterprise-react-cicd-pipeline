#!/usr/bin/env bash
# Copy the immutable release bundle and both app images to the staging VM.
# Runner pulls/saves by name@sha256 (manifest). After docker load on the VM,
# images are addressed by imageId (config digest) because RepoDigests are not
# reliably restored offline.
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
EXPECTED_WEB_ID="$(jq -er '.images.web.imageId' "${RELEASE_DIR}/release.json")"
EXPECTED_API_ID="$(jq -er '.images.api.imageId' "${RELEASE_DIR}/release.json")"
EXPECTED_VERSION="$(jq -er '.version' "${RELEASE_DIR}/release.json")"
validate_image_id "$EXPECTED_WEB_ID"
validate_image_id "$EXPECTED_API_ID"
validate_release_compose_placeholders "${RELEASE_DIR}/compose.yml"

if [ "$VERSION" != "$EXPECTED_VERSION" ]; then
  echo "VERSION (${VERSION}) does not match release.json (${EXPECTED_VERSION})" >&2
  exit 1
fi
if [ "$WEB_IMAGE" != "$EXPECTED_WEB" ] || [ "$API_IMAGE" != "$EXPECTED_API" ]; then
  echo "Transfer refs must match release.json references" >&2
  exit 1
fi

# Prove runner images match the recorded config Ids before save.
WEB_ID="$(docker image inspect --format='{{.Id}}' "$WEB_IMAGE")"
API_ID="$(docker image inspect --format='{{.Id}}' "$API_IMAGE")"
if [ "$WEB_ID" != "$EXPECTED_WEB_ID" ] || [ "$API_ID" != "$EXPECTED_API_ID" ]; then
  echo "Runner image Ids do not match release.json imageId values" >&2
  echo "  web got=${WEB_ID} want=${EXPECTED_WEB_ID}" >&2
  echo "  api got=${API_ID} want=${EXPECTED_API_ID}" >&2
  exit 1
fi

# Content identity for offline load: some Docker daemons rewrite config Ids on
# docker load (OCI/docker media-type conversion). RootFS layer digests stay stable.
WEB_ROOTFS="$(docker image inspect --format='{{json .RootFS.Layers}}' "$EXPECTED_WEB_ID")"
API_ROOTFS="$(docker image inspect --format='{{json .RootFS.Layers}}' "$EXPECTED_API_ID")"
if [ -z "$WEB_ROOTFS" ] || [ "$WEB_ROOTFS" = "null" ] || [ -z "$API_ROOTFS" ] || [ "$API_ROOTFS" = "null" ]; then
  echo "Failed to read RootFS.Layers for release images" >&2
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
RSYNC_RSH="ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

save_checked_archive() {
  local ref="$1"
  local image_id="$2"
  local dest="$3"
  echo "Saving ${ref} by image Id ${image_id}"
  docker save -o "$dest" "$image_id"
  if [ ! -s "$dest" ]; then
    echo "Refusing to transfer empty archive for ${ref}" >&2
    exit 1
  fi
  gzip -f "$dest"
}

save_checked_archive "$WEB_IMAGE" "$EXPECTED_WEB_ID" "${workdir}/web.tar"
save_checked_archive "$API_IMAGE" "$EXPECTED_API_ID" "${workdir}/api.tar"
ls -lh "${workdir}/web.tar.gz" "${workdir}/api.tar.gz"

echo "Syncing immutable release bundle to ${DEPLOY_ROOT}"
"${SSH[@]}" "$REMOTE" "mkdir -p '${DEPLOY_ROOT}'"
"${SSH[@]}" "$REMOTE" \
  "DEPLOY_ROOT='${DEPLOY_ROOT}' bash -s" <<'EOF'
set -euo pipefail

backup_if_possible() {
  local src="$1"
  local dest="$2"
  [ -f "$src" ] || return 0
  if cp "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  rm -f "$dest" 2>/dev/null || true
  if cp "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  echo "WARNING: could not backup ${src} -> ${dest} (permission denied); continuing" >&2
}

# Older deploys may have left root-owned files under /opt/platform. Prefer a
# best-effort previous-* backup, then clear unwritable targets rsync must replace.
backup_if_possible "${DEPLOY_ROOT}/release.json" "${DEPLOY_ROOT}/previous-release.json"
backup_if_possible "${DEPLOY_ROOT}/compose.yml" "${DEPLOY_ROOT}/previous-compose.yml"

for name in release.json release-metadata.json checksums.txt compose.yml \
  deploy-stack.sh rollback-stack.sh health-check.sh transfer-release-images.sh \
  web-sbom.cyclonedx.json api-sbom.cyclonedx.json runtime-images.env; do
  path="${DEPLOY_ROOT}/${name}"
  if [ -e "$path" ] && [ ! -w "$path" ]; then
    if rm -f "$path" 2>/dev/null; then
      echo "Removed unwritable ${path} so the new release can be synced"
    else
      echo "ERROR: ${path} is not writable and could not be replaced" >&2
      ls -la "${DEPLOY_ROOT}" >&2 || true
      exit 1
    fi
  fi
done
if [ -d "${DEPLOY_ROOT}/lib" ] && [ ! -w "${DEPLOY_ROOT}/lib" ]; then
  echo "ERROR: ${DEPLOY_ROOT}/lib is not writable" >&2
  exit 1
fi
EOF
rsync -az -e "$RSYNC_RSH" "${RELEASE_DIR}/" "${REMOTE}:${DEPLOY_ROOT}/"

"${SSH[@]}" "$REMOTE" "cd '${DEPLOY_ROOT}' && sha256sum -c checksums.txt"

remote_dir="${DEPLOY_ROOT}/.image-transfer"
"${SSH[@]}" "$REMOTE" "rm -rf '${remote_dir}' && mkdir -p '${remote_dir}'"
"${SCP[@]}" "${workdir}/web.tar.gz" "${workdir}/api.tar.gz" "${REMOTE}:${remote_dir}/"

# Base64 RootFS JSON so it survives SSH env safely.
WEB_ROOTFS_B64="$(printf '%s' "$WEB_ROOTFS" | base64 -w 0 2>/dev/null || printf '%s' "$WEB_ROOTFS" | base64)"
API_ROOTFS_B64="$(printf '%s' "$API_ROOTFS" | base64 -w 0 2>/dev/null || printf '%s' "$API_ROOTFS" | base64)"

"${SSH[@]}" "$REMOTE" \
  "REMOTE_DIR='${remote_dir}' DEPLOY_ROOT='${DEPLOY_ROOT}' WEB_REF='${WEB_IMAGE}' API_REF='${API_IMAGE}' WEB_ID='${EXPECTED_WEB_ID}' API_ID='${EXPECTED_API_ID}' WEB_ROOTFS_B64='${WEB_ROOTFS_B64}' API_ROOTFS_B64='${API_ROOTFS_B64}' bash -s" <<'EOF'
set -euo pipefail
trap 'rm -rf "$REMOTE_DIR"' EXIT

WEB_ROOTFS="$(printf '%s' "$WEB_ROOTFS_B64" | base64 -d)"
API_ROOTFS="$(printf '%s' "$API_ROOTFS_B64" | base64 -d)"

load_one() {
  local archive="$1"
  local digest_ref="$2"
  local expected_id="$3"
  local expected_rootfs="$4"
  local plain="${archive%.gz}"
  local load_out="" loaded_id="" loaded_rootfs=""

  echo "Loading ${archive} for ${digest_ref}" >&2
  echo "  release imageId=${expected_id}" >&2
  gzip -dc "$archive" > "$plain"
  load_out="$(docker load -i "$plain")"
  printf '%s\n' "$load_out" >&2

  if docker image inspect "$expected_id" >/dev/null 2>&1; then
    loaded_id="$expected_id"
  elif printf '%s\n' "$load_out" | grep -q 'Loaded image ID:'; then
    loaded_id="$(printf '%s\n' "$load_out" | sed -n 's/.*Loaded image ID: //p' | head -1 | tr -d '[:space:]')"
  elif printf '%s\n' "$load_out" | grep -q 'Loaded image:'; then
    loaded_id="$(docker image inspect --format='{{.Id}}' "$(printf '%s\n' "$load_out" | sed -n 's/.*Loaded image: //p' | head -1 | tr -d '[:space:]')")"
  else
    echo "Could not determine loaded image Id from docker load output" >&2
    docker images >&2 || true
    exit 1
  fi

  docker image inspect "$loaded_id" >/dev/null
  loaded_rootfs="$(docker image inspect --format='{{json .RootFS.Layers}}' "$loaded_id")"
  if [ "$loaded_rootfs" != "$expected_rootfs" ]; then
    echo "Loaded RootFS.Layers mismatch for ${digest_ref}" >&2
    echo "  loaded Id=${loaded_id}" >&2
    echo "  release Id=${expected_id}" >&2
    echo "  got layers=${loaded_rootfs}" >&2
    echo "  want layers=${expected_rootfs}" >&2
    exit 1
  fi

  if [ "$loaded_id" != "$expected_id" ]; then
    echo "NOTE: docker load rewrote config Id (${expected_id} -> ${loaded_id}); RootFS layers match." >&2
  fi

  rm -f "$archive" "$plain"
  # Only the Id goes to stdout (captured by the caller).
  printf '%s\n' "$loaded_id"
}

WEB_RUNTIME_ID="$(load_one "${REMOTE_DIR}/web.tar.gz" "$WEB_REF" "$WEB_ID" "$WEB_ROOTFS")"
API_RUNTIME_ID="$(load_one "${REMOTE_DIR}/api.tar.gz" "$API_REF" "$API_ID" "$API_ROOTFS")"

umask 077
cat > "${DEPLOY_ROOT}/runtime-images.env" <<ENV
WEB_IMAGE=${WEB_RUNTIME_ID}
API_IMAGE=${API_RUNTIME_ID}
WEB_DIGEST_REF=${WEB_REF}
API_DIGEST_REF=${API_REF}
WEB_RELEASE_IMAGE_ID=${WEB_ID}
API_RELEASE_IMAGE_ID=${API_ID}
ENV
chmod 600 "${DEPLOY_ROOT}/runtime-images.env"
echo "Wrote ${DEPLOY_ROOT}/runtime-images.env"
echo "  web runtime Id=${WEB_RUNTIME_ID}"
echo "  api runtime Id=${API_RUNTIME_ID}"
EOF

remote_web_ref="$("${SSH[@]}" "$REMOTE" "jq -er '.images.web.reference' '${DEPLOY_ROOT}/release.json'")"
remote_api_ref="$("${SSH[@]}" "$REMOTE" "jq -er '.images.api.reference' '${DEPLOY_ROOT}/release.json'")"
if [ "$remote_web_ref" != "$EXPECTED_WEB" ] || [ "$remote_api_ref" != "$EXPECTED_API" ]; then
  echo "VM release.json digests diverged from the CI bundle" >&2
  exit 1
fi

echo "Staged immutable release ${VERSION}"
echo "  web=${WEB_IMAGE} (release Id ${EXPECTED_WEB_ID})"
echo "  api=${API_IMAGE} (release Id ${EXPECTED_API_ID})"
echo "  runtime Ids are recorded in ${DEPLOY_ROOT}/runtime-images.env after docker load"
