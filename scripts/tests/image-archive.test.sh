#!/usr/bin/env bash
# Checks archive tag detection and the transfer script's fail-closed guards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/image-archive.sh
source "${ROOT}/scripts/lib/image-archive.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local archive="$1"
  local ref="$2"
  if ! image_archive_contains_ref "$archive" "$ref"; then
    fail "expected ${archive} to contain ${ref}"
  fi
}

assert_missing() {
  local archive="$1"
  local ref="$2"
  if image_archive_contains_ref "$archive" "$ref" >/dev/null 2>&1; then
    fail "expected ${archive} to lack ${ref}"
  fi
}

make_tar() {
  local dest="$1"
  local dir
  local names=()
  dir="$(mktemp -d)"
  shift
  while [ "$#" -ge 2 ]; do
    printf '%s' "$2" > "${dir}/$1"
    names+=("$1")
    shift 2
  done
  tar -C "$dir" -cf "$dest" "${names[@]}"
  rm -rf "$dir"
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

web_ref="platform-web:staging-1-1"
api_ref="platform-api:2026.09.1"

make_tar "${tmp}/docker-web.tar" manifest.json \
  "[{\"Config\":\"abc\",\"RepoTags\":[\"${web_ref}\"],\"Layers\":[\"layer.tar\"]}]"
assert_contains "${tmp}/docker-web.tar" "$web_ref"
assert_missing "${tmp}/docker-web.tar" "$api_ref"

make_tar "${tmp}/prefixed.tar" manifest.json \
  "[{\"Config\":\"abc\",\"RepoTags\":[\"docker.io/library/${web_ref}\"],\"Layers\":[]}]"
assert_contains "${tmp}/prefixed.tar" "$web_ref"

make_tar "${tmp}/untagged.tar" manifest.json \
  "[{\"Config\":\"abc\",\"RepoTags\":null,\"Layers\":[]}]"
assert_missing "${tmp}/untagged.tar" "$web_ref"

make_tar "${tmp}/oci.tar" index.json \
  "{\"schemaVersion\":2,\"manifests\":[{\"annotations\":{\"io.containerd.image.name\":\"docker.io/library/${api_ref}\",\"org.opencontainers.image.ref.name\":\"2026.09.1\"}}]}"
assert_contains "${tmp}/oci.tar" "$api_ref"
assert_missing "${tmp}/oci.tar" "$web_ref"

make_tar "${tmp}/oci-tag-only.tar" index.json \
  "{\"schemaVersion\":2,\"manifests\":[{\"annotations\":{\"org.opencontainers.image.ref.name\":\"${web_ref}\"}}]}"
assert_contains "${tmp}/oci-tag-only.tar" "$web_ref"

make_tar "${tmp}/empty.tar" note.txt "not-an-image"
assert_missing "${tmp}/empty.tar" "$web_ref"

if image_archive_contains_ref "${tmp}/docker-web.tar" "not-a-ref" >/dev/null 2>&1; then
  fail "name without a tag should be rejected"
fi

expect_transfer_failure() {
  local label="$1"
  shift
  local out=""
  local code=0
  set +e
  out="$(env "$@" bash "${ROOT}/scripts/transfer-release-images.sh" 2>&1)"
  code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    fail "${label} should have failed"
  fi
  printf '%s\n' "$out"
  if ! printf '%s\n' "$out" | grep -q "$label"; then
    fail "expected failure output to mention '${label}', got: ${out}"
  fi
}

expect_transfer_failure "not a GHCR digest ref" \
  HOST=staging.example USER=deploy DEPLOY_ROOT=/opt/platform VERSION=2026.09.1 \
  WEB_IMAGE='ghcr.io/acme/platform-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  API_IMAGE='platform-api:staging-1-1' \
  LOCAL_WEB='platform-web:2026.09.1' \
  LOCAL_API='platform-api:2026.09.1'

expect_transfer_failure "must be a safe name:tag" \
  HOST=staging.example USER=deploy DEPLOY_ROOT=/opt/platform VERSION=2026.09.1 \
  WEB_IMAGE='platform-web:staging-1-1' \
  API_IMAGE='platform-api:staging-1-1' \
  LOCAL_WEB='platform-web:2026.09.1' \
  LOCAL_API='not a tag'

expect_transfer_failure "must be different" \
  HOST=staging.example USER=deploy DEPLOY_ROOT=/opt/platform VERSION=2026.09.1 \
  WEB_IMAGE='platform-web:staging-1-1' \
  API_IMAGE='platform-web:staging-1-1' \
  LOCAL_WEB='platform-web:2026.09.1' \
  LOCAL_API='platform-api:2026.09.1'

echo "image-archive tests passed"
