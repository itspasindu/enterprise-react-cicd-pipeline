#!/usr/bin/env bash
# Immutable image identity helpers.
# Source this file; do not execute it directly.

# GHCR / registry manifest reference: name@sha256:<64 hex>
validate_image_reference() {
  local image="${1:-}"
  if [ -z "$image" ] || [ "$image" = "null" ]; then
    echo "ERROR: Missing deployment image reference" >&2
    return 1
  fi
  if [[ ! "$image" =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "ERROR: Mutable Docker image reference detected (requires name@sha256:<digest>):" >&2
    echo "$image" >&2
    return 1
  fi
  return 0
}

# Local runtime identity after docker save/load: sha256:<64 hex> (image config Id)
validate_image_id() {
  local image="${1:-}"
  if [ -z "$image" ] || [ "$image" = "null" ]; then
    echo "ERROR: Missing image Id" >&2
    return 1
  fi
  if [[ ! "$image" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "ERROR: Expected local image Id sha256:<64 hex>, got:" >&2
    echo "$image" >&2
    return 1
  fi
  return 0
}

compose_service_image() {
  local compose_file="$1"
  local service="$2"
  sed -n "/^  ${service}:/,/^  [a-z][a-z0-9_-]*:/p" "$compose_file" \
    | grep '^    image:' \
    | head -1 \
    | sed 's/^    image: //' \
    | tr -d '\r'
}

# Release compose must use env placeholders (digest refs are not portable across docker load).
validate_release_compose_placeholders() {
  local compose_file="$1"
  local web_line api_line
  web_line="$(compose_service_image "$compose_file" web)"
  api_line="$(compose_service_image "$compose_file" api)"
  if [ "$web_line" != '${WEB_IMAGE}' ]; then
    echo "ERROR: release compose web image must be \${WEB_IMAGE}, got: ${web_line}" >&2
    return 1
  fi
  if [ "$api_line" != '${API_IMAGE}' ]; then
    echo "ERROR: release compose api image must be \${API_IMAGE}, got: ${api_line}" >&2
    return 1
  fi
  return 0
}

verify_running_service_id() {
  local compose_file="$1"
  local env_file="$2"
  local service="$3"
  local expected_id="$4"
  local cid=""
  local running_id=""

  validate_image_id "$expected_id" || return 1
  cid="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q "$service" 2>/dev/null | head -n1)"
  if [ -z "$cid" ]; then
    echo "ERROR: No running container for service ${service}" >&2
    return 1
  fi
  running_id="$(docker inspect "$cid" --format '{{.Image}}')"
  if [ "$running_id" != "$expected_id" ]; then
    echo "ERROR: Running ${service} image Id does not match release imageId" >&2
    echo "  expected: ${expected_id}" >&2
    echo "  running:  ${running_id}" >&2
    return 1
  fi
  echo "Verified ${service} runs ${expected_id}"
  return 0
}
