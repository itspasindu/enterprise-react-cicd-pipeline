#!/usr/bin/env bash
# Helpers for API egress to api.github.com on dual-homed Compose stacks.
# Source this file; do not execute it directly.

resolve_github_api_ipv4() {
  local ip="${GITHUB_API_IP:-}"
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s\n' "$ip"
    return 0
  fi
  if command -v getent >/dev/null 2>&1; then
    ip="$(getent ahostsv4 api.github.com 2>/dev/null | awk '{print $1; exit}' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi
  if command -v dig >/dev/null 2>&1; then
    ip="$(dig +short api.github.com A 2>/dev/null | awk '/^[0-9]+\./ {print; exit}' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    ip="$(
      python3 - <<'PY' 2>/dev/null || true
import socket
try:
    print(socket.getaddrinfo("api.github.com", 443, socket.AF_INET)[0][4][0])
except Exception:
    pass
PY
    )"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi
  return 1
}

# Write ${DEPLOY_ROOT}/compose.egress.yml with DNS + extra_hosts for api.github.com.
write_compose_egress_override() {
  local deploy_root="$1"
  local dest="${deploy_root}/compose.egress.yml"
  local ip=""

  if ! ip="$(resolve_github_api_ipv4)"; then
    echo "ERROR: cannot resolve api.github.com to an IPv4 address for Compose extra_hosts." >&2
    echo "Set GITHUB_API_IP from a host that can resolve it (CD runner does this automatically)." >&2
    return 1
  fi

  umask 077
  cat > "$dest" <<EOF
# Generated at deploy time — not part of the immutable release checksums.
# Pins api.github.com so dual-homed API containers work when container DNS fails.
services:
  api:
    dns:
      - 1.1.1.1
      - 8.8.8.8
    extra_hosts:
      - "api.github.com:${ip}"
EOF
  chmod 644 "$dest"
  echo "Wrote ${dest} (api.github.com -> ${ip})"
}
