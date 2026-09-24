#!/usr/bin/env bash
# Free a host TCP port before Docker Compose publishes it.
#
# A single `fuser -k PORT/tcp` is not enough. On staging, that signal killed
# the current listener and a parent loop (vite/node preview, npm, or a shell
# restart) bound a new process to APP_PORT before the next check. CD then
# stopped and told an operator to SSH in and kill the pid by hand.
#
# Snapshot the listener first, stop the restarting parent / process group /
# Docker publisher / pm2 / systemd unit, then run fuser, and require the port
# to stay free for a second. Repeat while a new listener appears.
#
# Source this file and call free_host_port, or execute it with the port as $1
# (defaults to APP_PORT or 4173).

free_host_port() {
  local port="$1"
  local attempt

  if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "Invalid TCP port: ${port}" >&2
    exit 1
  fi

  echo "Freeing host port ${port}..."
  for attempt in 1 2 3 4 5; do
    if free_host_port_once "$port"; then
      sleep 1
      if ! port_is_listening "$port"; then
        echo "Port ${port} is free"
        return 0
      fi
      echo "Port ${port} was bound again after cleanup; retrying (${attempt}/5)"
    else
      echo "Port ${port} still in use after cleanup attempt ${attempt}/5"
    fi
  done

  report_port_still_busy "$port"
  exit 1
}

free_host_port_once() {
  local port="$1"
  local pids=""
  local pid

  remove_docker_publishers "$port"
  pids="$(listening_pids "$port")"
  # ss -p can miss a pid the kernel still lists as LISTEN. fuser, then look again
  # before the parent has time to be confused with "already gone".
  if [ -z "$pids" ] && port_is_listening "$port"; then
    run_fuser "$port"
    sleep 0.4
    pids="$(listening_pids "$port")"
  fi

  for pid in $pids; do
    stop_listener "$port" "$pid"
  done
  run_fuser "$port"

  if port_is_listening "$port" && sudo_noninteractive; then
    sudo_force_port "$port"
  fi

  if port_is_listening "$port"; then
    return 1
  fi
  return 0
}

port_is_listening() {
  local port="$1"
  local out=""

  if command -v ss >/dev/null 2>&1; then
    out="$(ss -H -tln "sport = :${port}" 2>/dev/null || true)"
    [ -n "${out//[[:space:]]/}" ]
    return
  fi
  [ -n "$(listening_pids_from_proc "$port")" ]
}

listening_pids() {
  local port="$1"
  local pids=""

  if ! port_is_listening "$port"; then
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    pids="$(
      COLUMNS=512 ss -H -tlnp "sport = :${port}" 2>/dev/null \
        | grep -oE 'pid=[0-9]+' \
        | cut -d= -f2 \
        | sort -u || true
    )"
  fi
  if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
  fi
  if [ -z "$pids" ]; then
    pids="$(listening_pids_from_proc "$port")"
  fi
  printf '%s\n' "$pids"
}

listening_pids_from_proc() {
  local port="$1"
  local hex inodes

  hex="$(printf '%04X' "$port")"
  inodes="$(
    awk -v hex="$hex" 'NR > 1 {
      n = split($2, addr, ":")
      if (toupper(addr[n]) == hex && $4 == "0A") print $10
    }' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u || true
  )"
  [ -n "$inodes" ] || return 0

  # find -lname treats [] as a glob class, so match the symlink text with awk.
  # find exits non-zero when /proc/<pid>/fd is unreadable; keep the pids it printed.
  find /proc -mindepth 3 -maxdepth 3 -path '/proc/[0-9]*/fd/*' -printf '%p %l\n' 2>/dev/null \
    | awk -v inodes="$inodes" '
      BEGIN {
        n = split(inodes, arr, /[[:space:]]+/)
        for (i = 1; i <= n; i++) if (arr[i] != "") want["socket:[" arr[i] "]"] = 1
      }
      {
        if ($NF in want) {
          split($1, path, "/")
          print path[3]
        }
      }
    ' | sort -u || true
}

remove_docker_publishers() {
  local port="$1"
  local ids=""

  command -v docker >/dev/null 2>&1 || return 0
  ids="$(docker ps -aq --filter "publish=${port}" 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    ids="$(
      docker ps -aq --format '{{.ID}} {{.Ports}}' 2>/dev/null \
        | awk -v needle=":${port}->" 'index($0, needle) { print $1 }' || true
    )"
  fi
  if [ -n "$ids" ]; then
    echo "Removing container(s) publishing host port ${port}: $(echo "$ids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null 2>&1 || true
  fi
}

stop_listener() {
  local port="$1"
  local pid="$2"
  local comm pgid

  [ -d "/proc/${pid}" ] || return 0
  comm="$(proc_field "$pid" comm)"
  case "$comm" in
    docker-proxy|dockerd|containerd*)
      remove_docker_publishers "$port"
      remove_docker_container_for_pid "$pid"
      return 0
      ;;
  esac

  remove_docker_container_for_pid "$pid"
  stop_systemd_unit_for_pid "$pid"
  stop_pm2_for_pid "$pid"
  stop_restarter_parents "$port" "$pid"

  pgid="$(proc_field "$pid" pgid)"
  if group_is_safe_to_kill "$pgid"; then
    echo "Stopping process group ${pgid} holding port ${port}"
    kill -9 -- "-${pgid}" 2>/dev/null || true
  fi
  if [ -d "/proc/${pid}" ]; then
    echo "Stopping listener pid ${pid} ($(proc_field "$pid" comm)) on port ${port}"
    kill_pid_hard "$pid"
  fi
}

# Parents that share the listener's session and look like npm/node/vite or a
# restart loop. Stop at the session boundary and at anything that started the
# deploy script, so a host node supervisor above ssh/bash is left running.
stop_restarter_parents() {
  local port="$1"
  local listener="$2"
  local cur ppid depth=0 index
  local -a restarters=()

  cur="$(proc_field "$listener" ppid)"
  while [ -n "$cur" ] && [ "$cur" != "0" ] && [ "$cur" != "1" ] && [ "$depth" -lt 8 ]; do
    if is_self_or_ancestor "$cur"; then
      break
    fi
    if ! same_session "$cur" "$listener"; then
      break
    fi
    if ! should_stop_ancestor "$cur" "$port"; then
      break
    fi
    restarters+=("$cur")
    ppid="$(proc_field "$cur" ppid)"
    if [ -z "$ppid" ] || [ "$ppid" = "$cur" ]; then
      break
    fi
    cur="$ppid"
    depth=$((depth + 1))
  done

  if [ "${#restarters[@]}" -eq 0 ]; then
    return 0
  fi
  for ((index = ${#restarters[@]} - 1; index >= 0; index--)); do
    cur="${restarters[$index]}"
    [ -d "/proc/${cur}" ] || continue
    echo "Stopping $(proc_field "$cur" comm) pid ${cur} (parent of listener on port ${port})"
    kill_pid_hard "$cur"
  done
}

is_self_or_ancestor() {
  local candidate="$1"
  local cur="$$"
  local depth=0
  local ppid

  [ -n "$candidate" ] || return 1
  while [ -n "$cur" ] && [ "$cur" != "0" ] && [ "$cur" != "1" ] && [ "$depth" -lt 15 ]; do
    [ "$cur" = "$candidate" ] && return 0
    ppid="$(proc_field "$cur" ppid)"
    if [ -z "$ppid" ] || [ "$ppid" = "$cur" ]; then
      break
    fi
    cur="$ppid"
    depth=$((depth + 1))
  done
  return 1
}

same_session() {
  local left right
  left="$(proc_field "$1" sid)"
  right="$(proc_field "$2" sid)"
  [ -n "$left" ] && [ "$left" = "$right" ]
}

should_stop_ancestor() {
  local pid="$1"
  local port="$2"
  local comm args

  comm="$(proc_field "$pid" comm)"
  args="$(proc_field "$pid" args)"
  case "$comm" in
    npm|npx|node|nodejs|vite|pm2|PM2*|nohup)
      return 0
      ;;
    bash|sh|dash|ash|zsh)
      if printf '%s\n' "$args" | grep -Eq "preview|vite|node|npm|npx|while|until|(^|[[:space:]])${port}([^0-9]|$)"; then
        return 0
      fi
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

group_is_safe_to_kill() {
  local pgid="$1"
  local own_pgid member members

  [ -n "$pgid" ] || return 1
  [ "$pgid" != "0" ] && [ "$pgid" != "1" ] || return 1
  own_pgid="$(proc_field "$$" pgid)"
  [ "$pgid" != "$own_pgid" ] || return 1

  if ps -eo pgid=,pid=,comm= | awk -v g="$pgid" '
    $1 == g && ($3 ~ /^(dockerd|containerd|sshd|systemd|init)/) { found = 1 }
    END { exit found ? 0 : 1 }
  '; then
    return 1
  fi

  members="$(ps -eo pgid=,pid= | awk -v g="$pgid" '$1 == g { print $2 }')"
  for member in $members; do
    if is_self_or_ancestor "$member"; then
      return 1
    fi
  done
  return 0
}

kill_pid_hard() {
  local pid="$1"
  if is_self_or_ancestor "$pid"; then
    return 0
  fi
  kill -9 "$pid" 2>/dev/null || true
  if [ -d "/proc/${pid}" ] && ! kill -0 "$pid" 2>/dev/null && sudo_noninteractive; then
    sudo -n kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}

run_fuser() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    # PIDs go to stdout with no trailing newline; discard both streams so the
    # next log line is not glued to a raw pid.
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
}

sudo_noninteractive() {
  command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1
}

sudo_force_port() {
  local port="$1"
  local pids pid pgid

  echo "Port ${port} is still held after a user-level stop; retrying with sudo -n"
  sudo -n fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  pids="$(listening_pids "$port")"
  for pid in $pids; do
    if is_self_or_ancestor "$pid"; then
      continue
    fi
    pgid="$(proc_field "$pid" pgid)"
    if group_is_safe_to_kill "$pgid"; then
      sudo -n kill -9 -- "-${pgid}" >/dev/null 2>&1 || true
    fi
    sudo -n kill -9 "$pid" >/dev/null 2>&1 || true
  done
}

stop_pm2_for_pid() {
  local pid="$1"
  local name=""

  command -v pm2 >/dev/null 2>&1 || return 0
  command -v jq >/dev/null 2>&1 || return 0
  name="$(
    pm2 jlist 2>/dev/null \
      | jq -r --arg pid "$pid" '.[] | select((.pid | tostring) == $pid) | .name' 2>/dev/null \
      | head -1 || true
  )"
  if [ -n "$name" ] && [ "$name" != "null" ]; then
    echo "Removing pm2 app ${name} (pid ${pid}) so it cannot restart on port"
    pm2 delete "$name" >/dev/null 2>&1 || true
  fi
}

stop_systemd_unit_for_pid() {
  local pid="$1"
  local unit=""

  [ -r "/proc/${pid}/cgroup" ] || return 0
  unit="$(grep -oE '[A-Za-z0-9:@_.\\-]+\.service' "/proc/${pid}/cgroup" 2>/dev/null | head -1 || true)"
  [ -n "$unit" ] || return 0
  echo "Stopping systemd unit ${unit} (pid ${pid})"
  systemctl stop "$unit" >/dev/null 2>&1 || true
  systemctl --user stop "$unit" >/dev/null 2>&1 || true
  if sudo_noninteractive; then
    sudo -n systemctl stop "$unit" >/dev/null 2>&1 || true
  fi
}

remove_docker_container_for_pid() {
  local pid="$1"
  local cgroup="" cid=""

  command -v docker >/dev/null 2>&1 || return 0
  [ -r "/proc/${pid}/cgroup" ] || return 0
  cgroup="$(cat "/proc/${pid}/cgroup" 2>/dev/null || true)"
  cid="$(printf '%s\n' "$cgroup" | sed -n 's/.*docker[-/]\([0-9a-f]\{12,64\}\).*/\1/p' | head -1)"
  if [ -z "$cid" ]; then
    cid="$(printf '%s\n' "$cgroup" | sed -n 's/.*libpod-\([0-9a-f]\{12,64\}\).*/\1/p' | head -1)"
  fi
  if [ -n "$cid" ]; then
    echo "Removing container ${cid} that holds a listener"
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}

proc_field() {
  local pid="$1"
  local field="$2"
  ps -o "${field}=" -p "$pid" 2>/dev/null | awk 'NR == 1 { $1 = $1; print }' || true
}

report_port_still_busy() {
  local port="$1"
  local pid ppid

  # stdout, not stderr: GitHub Actions only honors ::error:: workflow commands on stdout.
  echo "::error::Port ${port} is still in use after automatic cleanup."
  if command -v ss >/dev/null 2>&1; then
    COLUMNS=512 ss -tlnp "sport = :${port}" || ss -tln "sport = :${port}" || true
  fi
  for pid in $(listening_pids "$port"); do
    ppid="$(proc_field "$pid" ppid)"
    echo "listener pid=${pid} user=$(proc_field "$pid" user) comm=$(proc_field "$pid" comm) args=$(proc_field "$pid" args)"
    echo "parent pid=${ppid} comm=$(proc_field "$ppid" comm) args=$(proc_field "$ppid" args)"
  done
  echo "Cleanup already removed Docker publishers on ${port}, stopped restarting parents and process groups, and ran fuser -k ${port}/tcp."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  free_host_port "${1:-${APP_PORT:-4173}}"
fi
