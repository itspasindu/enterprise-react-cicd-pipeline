#!/usr/bin/env bash
# Pack the web build and API into release/ for CD. No container images.
# Required env: VERSION GITHUB_SHA GITHUB_REPOSITORY
# Optional: GITHUB_RUN_ID ROOT OUT SKIP_NPM_CI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
OUT="${OUT:-${ROOT}/release}"

: "${VERSION:?VERSION is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

if [[ ! "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "GITHUB_SHA must be the full 40-character commit SHA, got: ${GITHUB_SHA}" >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]+$ ]]; then
  echo "VERSION must look like YYYY.MM.N, got: ${VERSION}" >&2
  exit 1
fi
if [ ! -f "${ROOT}/dist/index.html" ]; then
  echo "Missing ${ROOT}/dist/index.html. Build the web assets before packaging." >&2
  exit 1
fi

CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rm -rf "$OUT"
mkdir -p "${OUT}/web" "${OUT}/api" "${OUT}/lib"

cp -a "${ROOT}/dist/." "${OUT}/web/"
tar -C "${ROOT}/server" \
  --exclude node_modules \
  --exclude tests \
  --exclude coverage \
  -cf - . | tar -C "${OUT}/api" -xf -

if [ "${SKIP_NPM_CI:-}" != "1" ]; then
  npm ci --prefix "${OUT}/api" --omit=dev
  npm sbom --prefix "${OUT}/api" --omit=dev --sbom-format cyclonedx > "${OUT}/api.cdx.json"
  if [ -f "${ROOT}/package-lock.json" ]; then
    npm sbom --prefix "${ROOT}" --omit=dev --sbom-format cyclonedx > "${OUT}/web.cdx.json"
  fi
fi

cp "${SCRIPT_DIR}/deploy-release.sh" "${SCRIPT_DIR}/rollback-release.sh" "${SCRIPT_DIR}/health-check.sh" "$OUT/"
cp "${SCRIPT_DIR}/lib/host-process.sh" "${OUT}/lib/host-process.sh"
chmod 0755 "${OUT}/deploy-release.sh" "${OUT}/rollback-release.sh" "${OUT}/health-check.sh" "${OUT}/lib/host-process.sh"

export VERSION GITHUB_SHA GITHUB_REPOSITORY CREATED_AT
export GITHUB_RUN_ID="${GITHUB_RUN_ID:-}"
export OUT_JSON="${OUT}/release.json"
export OUT_META="${OUT}/release-metadata.json"
node --input-type=module -e '
  import { writeFileSync } from "node:fs"
  const release = {
    version: process.env.VERSION,
    commit: process.env.GITHUB_SHA,
    createdAt: process.env.CREATED_AT,
    workflowRunId: process.env.GITHUB_RUN_ID || "",
    repository: process.env.GITHUB_REPOSITORY,
    directoryName: `${process.env.VERSION}-${process.env.GITHUB_SHA}`,
    runtime: "host-node",
    images: {
      web: { tag: null, digest: null, reference: null, imageId: null },
      api: { tag: null, digest: null, reference: null, imageId: null },
    },
  }
  const json = JSON.stringify(release, null, 2) + "\n"
  writeFileSync(process.env.OUT_JSON, json)
  writeFileSync(process.env.OUT_META, json)
'

(
  cd "$OUT"
  find . -type f ! -name checksums.txt -print0 | sort -z | xargs -0 sha256sum > checksums.txt
)

echo "Release bundle ${VERSION} ${GITHUB_SHA}"
