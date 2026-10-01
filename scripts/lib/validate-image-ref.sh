#!/usr/bin/env bash
# Immutable deployment image references: name@sha256:<64 hex chars>
# Source this file; do not execute it directly.

validate_image_reference() {
  local image="${1:-}"
  if [ -z "$image" ] || [ "$image" = "null" ]; then
    echo "ERROR: Missing deployment image reference" >&2
    return 1
  fi
  if [[ ! "$image" =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "ERROR: Mutable Docker image reference detected (deployment requires @sha256:<digest>):" >&2
    echo "$image" >&2
    return 1
  fi
  return 0
}

# Application services only (postgres base image is excluded).
compose_service_image() {
  local compose_file="$1"
  local service="$2"
  sed -n "/^  ${service}:/,/^  [a-z][a-z0-9_-]*:/p" "$compose_file" \
    | grep '^    image:' \
    | head -1 \
    | sed 's/^    image: //' \
    | tr -d '\r'
}

validate_compose_application_images() {
  local compose_file="$1"
  local web_ref="$2"
  local api_ref="$3"
  local web_line=""
  local api_line=""

  validate_image_reference "$web_ref" || return 1
  validate_image_reference "$api_ref" || return 1

  web_line="$(compose_service_image "$compose_file" web)"
  api_line="$(compose_service_image "$compose_file" api)"

  if [ "$web_line" != "$web_ref" ]; then
    echo "ERROR: compose web image mismatch" >&2
    echo "  expected: $web_ref" >&2
    echo "  compose:  $web_line" >&2
    return 1
  fi
  if [ "$api_line" != "$api_ref" ]; then
    echo "ERROR: compose api image mismatch" >&2
    echo "  expected: $api_ref" >&2
    echo "  compose:  $api_line" >&2
    return 1
  fi

  validate_image_reference "$web_line" || return 1
  validate_image_reference "$api_line" || return 1
  return 0
}

verify_running_service_digest() {
  local compose_file="$1"
  local env_file="$2"
  local service="$3"
  local expected_ref="$4"
  local expected_id=""
  local cid=""
  local running_id=""

  validate_image_reference "$expected_ref" || return 1
  expected_id="$(docker image inspect "$expected_ref" --format '{{.Id}}')"
  cid="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q "$service" 2>/dev/null | head -n1)"
  if [ -z "$cid" ]; then
    echo "ERROR: No running container for service ${service}" >&2
    return 1
  fi
  running_id="$(docker inspect "$cid" --format '{{.Image}}')"
  if [ "$running_id" != "$expected_id" ]; then
    echo "ERROR: Running ${service} image does not match expected digest reference" >&2
    echo "  expected image id: ${expected_id} (${expected_ref})" >&2
    echo "  running image id:  ${running_id}" >&2
    return 1
  fi
  echo "Verified ${service} runs ${expected_ref}"
  return 0
}
