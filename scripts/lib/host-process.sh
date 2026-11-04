#!/usr/bin/env bash
# Start the API from the current release symlink. Node and PostgreSQL are already on the host.
set -euo pipefail

start_release_process() {
  local deploy_root="$1"
  local pidfile="${deploy_root}/api.pid"
  local logfile="${deploy_root}/api.log"
  local envfile="${deploy_root}/current.env"
  local app_dir="${deploy_root}/current/api"

  [ -f "$envfile" ] || { echo "Missing ${envfile}" >&2; return 1; }
  [ -d "$app_dir" ] || { echo "Missing ${app_dir}" >&2; return 1; }
  command -v node >/dev/null || { echo "node is required on the host" >&2; return 1; }

  if [ -f "$pidfile" ]; then
    local old
    old="$(tr -d '[:space:]' < "$pidfile" || true)"
    if [ -n "${old}" ] && kill -0 "$old" 2>/dev/null; then
      kill "$old" || true
      local _
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$old" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$old" 2>/dev/null || true
    fi
  fi

  nohup bash -c '
    trap "" HUP
    set -a
    # shellcheck disable=SC1090
    source "$1"
    set +a
    cd "$2"
    exec node src/index.js
  ' bash "$envfile" "$app_dir" >>"$logfile" 2>&1 </dev/null &
  echo $! > "$pidfile"
  disown || true
}

wait_until_ready() {
  local url="${1:-http://127.0.0.1:4173/api/ready}"
  local _
  for _ in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null; then
      echo "Ready: ${url}"
      return 0
    fi
    sleep 1
  done
  echo "API did not become ready at ${url}" >&2
  return 1
}
