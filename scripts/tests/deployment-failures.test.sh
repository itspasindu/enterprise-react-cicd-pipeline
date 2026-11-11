#!/usr/bin/env bash
# Exercise real deploy/rollback scripts in disposable roots. Process and database
# effects are injected through the fixture library and node migration command.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export REAL_NODE="$(command -v node)"
mkdir -p "$WORK/bin"
cat > "$WORK/bin/node" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = src/migrate.js ]; then
  echo migration >> "$DEPLOY_ROOT/events"
  [ "${FAIL_MIGRATION:-0}" != 1 ] || exit 1
  echo applied >> "$DEPLOY_ROOT/database-state"
else
  exec "$REAL_NODE" "$@"
fi
EOF
chmod +x "$WORK/bin/node"
export PATH="$WORK/bin:$PATH"

fixture() {
  export DEPLOY_ROOT="$WORK/$1/host" RELEASE_DIR="$WORK/$1/release"
  export POSTGRES_PASSWORD=test FAIL_MIGRATION=0 FAIL_READY=0
  mkdir -p "$RELEASE_DIR/web" "$RELEASE_DIR/api" "$RELEASE_DIR/lib" "$DEPLOY_ROOT/releases/old"
  printf '{"version":"2026.11.1","commit":"%040d"}\n' 1 > "$RELEASE_DIR/release.json"
  echo web > "$RELEASE_DIR/web/index.html"
  echo '{}' > "$RELEASE_DIR/api/package.json"
  cp "$ROOT/scripts/deploy-release.sh" "$ROOT/scripts/rollback-release.sh" "$RELEASE_DIR/"
  cat > "$RELEASE_DIR/lib/host-process.sh" <<'EOF'
replace_unwritable() { :; }
start_release_process() { echo "start:$(readlink "$1/current")" >> "$1/events"; }
wait_until_ready() { [ "${FAIL_READY:-0}" != 1 ]; }
EOF
  echo '{"version":"2026.10.1","commit":"old"}' > "$DEPLOY_ROOT/releases/old/release.json"
  ln -s "$DEPLOY_ROOT/releases/old" "$DEPLOY_ROOT/current"
  echo existing-data > "$DEPLOY_ROOT/database-state"
  (cd "$RELEASE_DIR" && find . -type f ! -name checksums.txt -print0 | sort -z | xargs -0 sha256sum > checksums.txt)
}
must_fail() {
  if bash "$RELEASE_DIR/deploy-release.sh" > "$WORK/output" 2>&1; then
    echo 'Expected deployment failure' >&2; exit 1
  fi
}
assert_old() { [ "$(readlink "$DEPLOY_ROOT/current")" = "$DEPLOY_ROOT/releases/old" ]; }

fixture checksum
echo tampered >> "$RELEASE_DIR/web/index.html"
must_fail
assert_old
test ! -e "$DEPLOY_ROOT/events"

fixture incomplete-copy
mkdir -p "$DEPLOY_ROOT/releases/2026.11.1-0000000000000000000000000000000000000001"
must_fail
assert_old
test ! -e "$DEPLOY_ROOT/events"

fixture migration
export FAIL_MIGRATION=1
must_fail
bash "$DEPLOY_ROOT/rollback-release.sh"
assert_old
test "$(cat "$DEPLOY_ROOT/database-state")" = existing-data
grep -q 'start:.*releases/old' "$DEPLOY_ROOT/events"

fixture readiness
export FAIL_READY=1
must_fail
if bash "$DEPLOY_ROOT/rollback-release.sh"; then
  echo 'Rollback must fail when readiness is still failing' >&2; exit 1
fi
export FAIL_READY=0
bash "$DEPLOY_ROOT/rollback-release.sh"
assert_old
grep -q applied "$DEPLOY_ROOT/database-state"
grep -q existing-data "$DEPLOY_ROOT/database-state"
grep -q 'start:.*releases/old' "$DEPLOY_ROOT/events"

fixture success
bash "$RELEASE_DIR/deploy-release.sh"
test "$(readlink "$DEPLOY_ROOT/current")" != "$DEPLOY_ROOT/releases/old"
grep -q applied "$DEPLOY_ROOT/database-state"
echo 'deployment failure tests passed'
