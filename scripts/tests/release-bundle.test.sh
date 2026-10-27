#!/usr/bin/env bash
# Pack a release without installing dependencies and check the archive contract.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "${WORK}/dist" "${WORK}/server"
echo '<!doctype html><title>release</title>' > "${WORK}/dist/index.html"
cat > "${WORK}/server/package.json" <<'EOF'
{ "name": "platform-api", "private": true, "version": "0.0.0" }
EOF
mkdir -p "${WORK}/server/src"
echo 'console.log("ok")' > "${WORK}/server/src/index.js"

SHA="0123456789abcdef0123456789abcdef01234567"
VERSION="2026.10.1" \
GITHUB_SHA="$SHA" \
GITHUB_REPOSITORY="acme/platform" \
GITHUB_RUN_ID="99" \
ROOT="$WORK" \
OUT="${WORK}/release" \
SKIP_NPM_CI=1 \
  bash "${ROOT}/scripts/create-release-bundle.sh"

(
  cd "${WORK}/release"
  sha256sum -c checksums.txt
)

node -e '
  const fs = require("fs")
  const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  if (release.runtime !== "host-node") process.exit(1)
  if (release.version !== "2026.10.1") process.exit(1)
  if (release.commit !== process.argv[2]) process.exit(1)
' "${WORK}/release/release.json" "$SHA"
test -f "${WORK}/release/web/index.html"
test -f "${WORK}/release/api/src/index.js"
test ! -d "${WORK}/release/api/tests"
test -x "${WORK}/release/deploy-release.sh"
test -f "${WORK}/release/lib/host-process.sh"

if grep -RIn --include='*.yml' -E 'docker |docker compose|reusable-docker|image: postgres' "${ROOT}/.github/workflows"; then
  echo "A workflow still runs Docker" >&2
  exit 1
fi

echo "release-bundle tests passed"
