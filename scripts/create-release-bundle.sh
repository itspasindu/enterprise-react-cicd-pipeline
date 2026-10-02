#!/usr/bin/env bash
# Assemble an immutable release/ directory for CD.
# Required env: VERSION WEB_DIGEST_REF API_DIGEST_REF WEB_IMAGE_NAME API_IMAGE_NAME
#               WEB_IMAGE_ID API_IMAGE_ID GITHUB_SHA GITHUB_REPOSITORY
# Optional: GITHUB_RUN_ID GITHUB_RUN_ATTEMPT ROOT OUT
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
OUT="${OUT:-${ROOT}/release}"

: "${VERSION:?VERSION is required}"
: "${WEB_DIGEST_REF:?WEB_DIGEST_REF is required}"
: "${API_DIGEST_REF:?API_DIGEST_REF is required}"
: "${WEB_IMAGE_NAME:?WEB_IMAGE_NAME is required}"
: "${API_IMAGE_NAME:?API_IMAGE_NAME is required}"
: "${WEB_IMAGE_ID:?WEB_IMAGE_ID is required}"
: "${API_IMAGE_ID:?API_IMAGE_ID is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

# shellcheck source=lib/validate-image-ref.sh
source "${SCRIPT_DIR}/lib/validate-image-ref.sh"

validate_image_reference "$WEB_DIGEST_REF"
validate_image_reference "$API_DIGEST_REF"
validate_image_id "$WEB_IMAGE_ID"
validate_image_id "$API_IMAGE_ID"

if [[ ! "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "GITHUB_SHA must be the full 40-character commit SHA, got: ${GITHUB_SHA}" >&2
  exit 1
fi

WEB_DIGEST="${WEB_DIGEST_REF##*@}"
API_DIGEST="${API_DIGEST_REF##*@}"
WEB_PUBLISH_TAG="${WEB_IMAGE_NAME}:${VERSION}"
API_PUBLISH_TAG="${API_IMAGE_NAME}:${VERSION}"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

rm -rf "$OUT"
mkdir -p "${OUT}/lib"

# Keep ${WEB_IMAGE}/${API_IMAGE} placeholders: digest refs do not survive docker save/load
# on typical staging daemons. Deploy injects imageId (config digest) at runtime.
python3 - "$ROOT/compose.yml" "$OUT/compose.yml" <<'PY'
import re
import sys
from pathlib import Path

src, dest = sys.argv[1:3]
images = {"web": "${WEB_IMAGE}", "api": "${API_IMAGE}"}
out = []
service = None
skip_build = False
build_indent = 0

for line in Path(src).read_text(encoding="utf-8").splitlines(keepends=True):
    svc = re.match(r"^  ([A-Za-z0-9_-]+):\s*(#.*)?$", line)
    if svc:
        service = svc.group(1)
        skip_build = False

    if skip_build:
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent > build_indent:
            continue
        skip_build = False

    if re.match(r"^    build:\s*(#.*)?$", line):
        skip_build = True
        build_indent = len(line) - len(line.lstrip(" "))
        continue

    if service in images and re.match(r"^    image:\s*", line):
        out.append(f"    image: {images[service]}\n")
        continue

    out.append(line)

Path(dest).write_text("".join(out), encoding="utf-8")
PY

cp "${ROOT}/scripts/deploy-stack.sh" \
  "${ROOT}/scripts/rollback-stack.sh" \
  "${ROOT}/scripts/health-check.sh" \
  "${ROOT}/scripts/transfer-release-images.sh" \
  "${OUT}/"
cp "${ROOT}/scripts/lib/image-archive.sh" \
  "${ROOT}/scripts/lib/validate-image-ref.sh" \
  "${ROOT}/scripts/lib/compose-egress.sh" \
  "${OUT}/lib/"

for sbom in web-sbom.cyclonedx.json api-sbom.cyclonedx.json; do
  if [ -f "${ROOT}/${sbom}" ]; then
    cp "${ROOT}/${sbom}" "${OUT}/"
  elif [ -f "${sbom}" ]; then
    cp "${sbom}" "${OUT}/"
  else
    echo "Missing ${sbom}" >&2
    exit 1
  fi
done

chmod +x "${OUT}/deploy-stack.sh" "${OUT}/rollback-stack.sh" "${OUT}/health-check.sh" "${OUT}/transfer-release-images.sh"

jq -n \
  --argjson schemaVersion 1 \
  --arg repository "$GITHUB_REPOSITORY" \
  --arg commit "$GITHUB_SHA" \
  --arg version "$VERSION" \
  --arg createdAt "$CREATED_AT" \
  --arg workflowRunId "${GITHUB_RUN_ID:-}" \
  --arg workflowRunAttempt "${GITHUB_RUN_ATTEMPT:-}" \
  --arg webPublishTag "$WEB_PUBLISH_TAG" \
  --arg apiPublishTag "$API_PUBLISH_TAG" \
  --arg webDigest "$WEB_DIGEST" \
  --arg apiDigest "$API_DIGEST" \
  --arg webRef "$WEB_DIGEST_REF" \
  --arg apiRef "$API_DIGEST_REF" \
  --arg webId "$WEB_IMAGE_ID" \
  --arg apiId "$API_IMAGE_ID" \
  '{
    schemaVersion: $schemaVersion,
    repository: $repository,
    commit: $commit,
    version: $version,
    createdAt: $createdAt,
    workflowRunId: $workflowRunId,
    workflowRunAttempt: $workflowRunAttempt,
    images: {
      web: { tag: $webPublishTag, digest: $webDigest, reference: $webRef, imageId: $webId },
      api: { tag: $apiPublishTag, digest: $apiDigest, reference: $apiRef, imageId: $apiId }
    }
  }' > "${OUT}/release.json"

jq '{
  version: .version,
  sha: .commit,
  webImage: .images.web.reference,
  apiImage: .images.api.reference,
  webImageId: .images.web.imageId,
  apiImageId: .images.api.imageId
}' "${OUT}/release.json" > "${OUT}/release-metadata.json"

(
  cd "$OUT"
  # shellcheck disable=SC2038
  find . -type f ! -name checksums.txt -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
) > "${OUT}/checksums.txt"

validate_release_compose_placeholders "${OUT}/compose.yml"

echo "Immutable release bundle written to ${OUT}"
jq '{version, commit, images}' "${OUT}/release.json"
