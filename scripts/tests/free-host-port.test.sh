#!/usr/bin/env bash
# A leftover listener plus a parent restart loop is what blocked staging CD:
# fuser killed the child, the parent bound the port again, and the one-shot
# check failed. This runs that situation against scripts/free-host-port.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/free-host-port.sh"
WORKFLOW="${ROOT}/.github/workflows/reusable-deploy.yml"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -x "$SCRIPT" ] || chmod +x "$SCRIPT"
command -v python3 >/dev/null || fail "python3 is required"
command -v ss >/dev/null || fail "ss is required"

if grep -nE 'On the VM run:|kill the pid shown above|Stop the process above' \
  "$WORKFLOW" \
  "${ROOT}/scripts/deploy-stack.sh" \
  "${ROOT}/scripts/rollback-stack.sh" \
  "$SCRIPT"; then
  fail "deploy path still tells operators to free the port by hand"
fi
grep -q 'free-host-port.sh' "$WORKFLOW" || fail "reusable-deploy.yml does not run free-host-port.sh"
grep -q 'free-host-port.sh' "${ROOT}/scripts/deploy-stack.sh" || fail "deploy-stack.sh does not source free-host-port.sh"
grep -q 'free-host-port.sh' "${ROOT}/scripts/rollback-stack.sh" || fail "rollback-stack.sh does not source free-host-port.sh"

pick_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

port_is_busy() {
  local port="$1"
  local out
  out="$(ss -H -tln "sport = :${port}" 2>/dev/null || true)"
  [ -n "${out//[[:space:]]/}" ]
}

wait_until_busy() {
  local port="$1"
  for _ in $(seq 1 50); do
    if port_is_busy "$port"; then
      return 0
    fi
    sleep 0.1
  done
  fail "port ${port} never started listening"
}

BG_PIDS=()
cleanup() {
  local pid pgid
  for pid in "${BG_PIDS[@]+"${BG_PIDS[@]}"}"; do
    [ -n "$pid" ] || continue
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    if [ -n "$pgid" ] && [ "$pgid" != "$(ps -o pgid= -p $$ | tr -d ' ')" ]; then
      kill -9 -- "-${pgid}" 2>/dev/null || true
    fi
    kill -9 "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Launch under setsid from a short-lived shell so this test is not the parent.
# Otherwise bash prints "Killed" when the listener group is stopped, and a
# shared process group would let cleanup signal the test itself.
launch_detached() {
  local launcher="$1"
  local log="$2"
  bash -c 'setsid "$1" >>"$2" 2>&1 </dev/null &' _ "$launcher" "$log"
}

start_restarter() {
  local port="$1"
  local pidfile launcher
  pidfile="$(mktemp)"
  launcher="$(mktemp)"
  cat > "$launcher" <<EOF
#!/usr/bin/env bash
echo \$\$ > "$pidfile"
while true; do
  python3 -m http.server "$port" --bind 127.0.0.1 || true
  sleep 0.2
done
EOF
  chmod +x "$launcher"
  launch_detached "$launcher" /tmp/free-host-port-restarter.log
  for _ in $(seq 1 50); do
    if [ -s "$pidfile" ]; then
      LAST_PID="$(cat "$pidfile")"
      BG_PIDS+=("$LAST_PID")
      return 0
    fi
    sleep 0.1
  done
  fail "restarter did not write its pid"
}

start_oneshot() {
  local port="$1"
  local pidfile launcher
  pidfile="$(mktemp)"
  launcher="$(mktemp)"
  cat > "$launcher" <<EOF
#!/usr/bin/env bash
echo \$\$ > "$pidfile"
exec python3 -m http.server "$port" --bind 127.0.0.1
EOF
  chmod +x "$launcher"
  launch_detached "$launcher" /tmp/free-host-port-oneshot.log
  for _ in $(seq 1 50); do
    if [ -s "$pidfile" ]; then
      LAST_PID="$(cat "$pidfile")"
      BG_PIDS+=("$LAST_PID")
      return 0
    fi
    sleep 0.1
  done
  fail "one-shot listener did not start"
}

assert_stays_free() {
  local port="$1"
  for _ in 1 2 3; do
    sleep 0.5
    if port_is_busy "$port"; then
      ss -tlnp "sport = :${port}" >&2 || true
      fail "port ${port} was listening again after cleanup"
    fi
  done
}

# Cleanup must not signal the deploy shell or the supervisors above it.
assert_ancestors_live() {
  local cur="$$"
  local depth=0
  local ppid
  while [ -n "$cur" ] && [ "$cur" != "1" ] && [ "$depth" -lt 15 ]; do
    # /proc, not kill -0: ancestors may be owned by another user (EPERM).
    [ -d "/proc/${cur}" ] || fail "cleanup killed ancestor pid ${cur}"
    ppid="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || true)"
    if [ -z "$ppid" ] || [ "$ppid" = "$cur" ]; then
      break
    fi
    cur="$ppid"
    depth=$((depth + 1))
  done
}

echo "sourcing free-host-port.sh does not start a cleanup"
# shellcheck source=../free-host-port.sh
source "$SCRIPT"
declare -F free_host_port >/dev/null || fail "free_host_port was not defined"

PORT="$(pick_port)"
start_oneshot "$PORT"
ONESHOT="$LAST_PID"
wait_until_busy "$PORT"
PROC_PIDS="$(listening_pids_from_proc "$PORT")"
printf '%s\n' "$PROC_PIDS" | grep -q '^[0-9]\+$' || fail "proc scan missed listener on ${PORT}: ${PROC_PIDS:-<empty>}"
echo "one-shot listener on ${PORT} (pid ${ONESHOT})"
bash "$SCRIPT" "$PORT"
assert_ancestors_live
if port_is_busy "$PORT"; then
  fail "one-shot listener on ${PORT} survived"
fi
kill -0 "$ONESHOT" 2>/dev/null && fail "one-shot pid ${ONESHOT} is still running"
assert_stays_free "$PORT"

PORT="$(pick_port)"
start_restarter "$PORT"
RESTARTER="$LAST_PID"
wait_until_busy "$PORT"
echo "restart loop on ${PORT} (pid ${RESTARTER})"
# Real fuser only signals the current listener. The parent must die too.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  rebound=0
  for _ in $(seq 1 30); do
    if port_is_busy "$PORT"; then
      rebound=1
      break
    fi
    sleep 0.1
  done
  [ "$rebound" -eq 1 ] || fail "expected the restart loop to bind ${PORT} again after a single fuser -k"
  kill -0 "$RESTARTER" 2>/dev/null || fail "restarter died from fuser alone; test no longer matches the CD failure"
fi
bash "$SCRIPT" "$PORT"
assert_ancestors_live
if port_is_busy "$PORT"; then
  fail "restart loop on ${PORT} survived automatic cleanup"
fi
kill -0 "$RESTARTER" 2>/dev/null && fail "restarter pid ${RESTARTER} is still running"
assert_stays_free "$PORT"

echo "free-host-port checks passed"
