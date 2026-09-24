#!/usr/bin/env bash
# The staging VM uses the Compose plugin pinned by reusable-deploy.yml.
# That release rejects `docker compose run --no-build` (exit 16) and accepts
# the same flag on `up`. Replay every deploy/rollback compose invocation
# against that binary so a new unsupported flag fails here first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="${ROOT}/.github/workflows/reusable-deploy.yml"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

COMPOSE_VERSION="$(sed -n 's/^[[:space:]]*COMPOSE_VERSION:[[:space:]]*//p' "$WORKFLOW" | head -1 | tr -d '[:space:]')"
[ -n "$COMPOSE_VERSION" ] || fail "COMPOSE_VERSION is not set in reusable-deploy.yml"

case "$(uname -m)" in
  x86_64) ARCH=x86_64 ;;
  aarch64 | arm64) ARCH=aarch64 ;;
  *) fail "unsupported arch $(uname -m)" ;;
esac

CACHE_DIR="${COMPOSE_BIN_CACHE:-/tmp}/compose-flag-check-${COMPOSE_VERSION}-${ARCH}"
COMPOSE_BIN="${CACHE_DIR}/docker-compose"
if [ ! -x "$COMPOSE_BIN" ]; then
  mkdir -p "$CACHE_DIR"
  url="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}"
  echo "Downloading ${url}"
  curl -fsSL "$url" -o "${COMPOSE_BIN}.partial"
  chmod +x "${COMPOSE_BIN}.partial"
  mv "${COMPOSE_BIN}.partial" "$COMPOSE_BIN"
fi

version_out="$("$COMPOSE_BIN" version)"
echo "$version_out" | grep -q "$COMPOSE_VERSION" || fail "binary reported '${version_out}', want ${COMPOSE_VERSION}"

run_help="$("$COMPOSE_BIN" run --help)"
up_help="$("$COMPOSE_BIN" up --help)"
echo "$run_help" | grep -q -- '--no-build' && fail "pinned ${COMPOSE_VERSION} run --help unexpectedly lists --no-build"
echo "$up_help" | grep -q -- '--no-build' || fail "pinned ${COMPOSE_VERSION} up --help is missing --no-build"
echo "$run_help" | grep -q -- '--pull' || fail "pinned ${COMPOSE_VERSION} run --help is missing --pull"

set +e
"$COMPOSE_BIN" run --rm --no-build api true >/tmp/compose-run-no-build.out 2>/tmp/compose-run-no-build.err
no_build_code=$?
set -e
[ "$no_build_code" -eq 16 ] || fail "run --no-build exited ${no_build_code}, want 16"
grep -q 'unknown flag: --no-build' /tmp/compose-run-no-build.err || fail "run --no-build did not report unknown flag"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ENV_FILE="${tmp}/env"
MISSING_YML="${tmp}/missing-compose.yml"
printf 'COMPOSE_PROJECT_NAME=platform\n' > "$ENV_FILE"

tokenize() {
  local line="$1"
  local -n dest="$2"
  line="${line%%>*}"
  line="${line%%|*}"
  line="${line//\"/}"
  line="${line//\'/}"
  read -r -a dest <<< "$line"
}

replay_compose_line() {
  local source="$1"
  local lineno="$2"
  local line="$3"
  local -a tokens=()
  local -a args=()
  local token=""

  tokenize "$line" tokens
  [ "${tokens[0]}" = "docker" ] && [ "${tokens[1]}" = "compose" ] || fail "${source}:${lineno} is not a docker compose invocation"

  local i
  for ((i = 2; i < ${#tokens[@]}; i++)); do
    token="${tokens[$i]}"
    token="${token//\$NEXT_ENV/$ENV_FILE}"
    token="${token//\$PREVIOUS_ENV/$ENV_FILE}"
    token="${token//\$COMPOSE_FILE/$MISSING_YML}"
    args+=("$token")
  done

  set +e
  "$COMPOSE_BIN" "${args[@]}" >"${tmp}/out" 2>"${tmp}/err"
  local code=$?
  set -e
  if [ "$code" -eq 16 ] || grep -q 'unknown flag' "${tmp}/err"; then
    fail "${source}:${lineno} is rejected by Compose ${COMPOSE_VERSION}: $(cat "${tmp}/err")"
  fi
  # Flags are parsed before the compose file or the daemon. Exit 14 is a missing
  # file; exit 1 here is only the daemon (stop/rm look up the project first).
  if [ "$code" -eq 14 ] && grep -q 'no such file' "${tmp}/err"; then
    return 0
  fi
  if [ "$code" -eq 1 ] && grep -q 'Cannot connect to the Docker daemon' "${tmp}/err"; then
    return 0
  fi
  fail "${source}:${lineno} exited ${code} after flag parsing; expected a missing compose file or no daemon: $(cat "${tmp}/err")"
}

scan_script() {
  local script="$1"
  local lineno
  local line
  while read -r lineno line; do
    replay_compose_line "$script" "$lineno" "$line"
  done < <(grep -nE '^[[:space:]]*docker compose ' "$script" | sed -E 's/:[[:space:]]*/ /')
}

scan_script "${ROOT}/scripts/deploy-stack.sh"
scan_script "${ROOT}/scripts/rollback-stack.sh"

migrate_line="$(grep -n 'node src/migrate.js' "${ROOT}/scripts/deploy-stack.sh")"
[ -n "$migrate_line" ] || fail "deploy-stack.sh is missing the migrate invocation"
echo "$migrate_line" | grep -q -- '--no-build' && fail "migrate invocation still passes --no-build: ${migrate_line}"
echo "$migrate_line" | grep -q -- '--pull never' || fail "migrate invocation must pass --pull never so v2.32.4 does not select pull_policy=build: ${migrate_line}"

while IFS= read -r line; do
  case "$line" in
    *" up "*)
      case "$line" in
        *" api "* | *" web "*)
          echo "$line" | grep -q -- '--no-build' || fail "application up must keep --no-build (supported on up): ${line}"
          ;;
      esac
      ;;
  esac
done < <(grep -E '^[[:space:]]*docker compose ' "${ROOT}/scripts/deploy-stack.sh" "${ROOT}/scripts/rollback-stack.sh")

echo "deploy compose flag checks passed for ${COMPOSE_VERSION}"
