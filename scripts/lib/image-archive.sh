#!/usr/bin/env bash
# Helpers for checking docker save archives before they are copied to staging.
# Source this file; do not execute it directly.

# image_archive_contains_ref ARCHIVE NAME:TAG
# Succeeds when a docker/OCI save archive records that name:tag.
# Untagged archives (docker save of an image ID) do not match.
image_archive_contains_ref() {
  local archive="$1"
  local ref="$2"
  local repo="${ref%%:*}"
  local tag="${ref#*:}"
  local manifest=""
  local index=""

  if [ -z "$repo" ] || [ -z "$tag" ] || [ "$repo" = "$ref" ]; then
    echo "image ref must be name:tag, got: ${ref}" >&2
    return 2
  fi
  if [ ! -f "$archive" ]; then
    echo "image archive not found: ${archive}" >&2
    return 2
  fi

  manifest="$(tar -xOf "$archive" manifest.json 2>/dev/null || true)"
  if [ -n "$manifest" ]; then
    if printf '%s' "$manifest" | jq -e --arg ref "$ref" '
      any(.[]; any((.RepoTags // [])[]; . == $ref or endswith("/" + $ref)))
    ' >/dev/null; then
      return 0
    fi
  fi

  index="$(tar -xOf "$archive" index.json 2>/dev/null || true)"
  if [ -n "$index" ]; then
    if printf '%s' "$index" | jq -e --arg ref "$ref" --arg repo "$repo" '
      any(.manifests[]?;
        (.annotations // {}) as $ann |
        ($ann["io.containerd.image.name"] // "") as $name |
        ($ann["org.opencontainers.image.ref.name"] // "") as $oci |
        ($name == $ref or ($name | endswith("/" + $ref)) or $name == ("docker.io/library/" + $ref))
        or
        (
          ($oci == $ref or ($oci | endswith("/" + $ref)))
          and (
            $name == ""
            or $name == $ref
            or $name == $repo
            or ($name | endswith("/" + $ref))
            or ($name | endswith("/" + $repo))
          )
        )
      )
    ' >/dev/null; then
      return 0
    fi
  fi

  echo "Archive $(basename "$archive") does not contain ${ref}." >&2
  if [ -n "$manifest" ]; then
    echo "manifest.json RepoTags:" >&2
    printf '%s' "$manifest" | jq -c '[.[]?.RepoTags]' >&2 || true
  fi
  if [ -n "$index" ]; then
    echo "index.json annotations:" >&2
    printf '%s' "$index" | jq -c '[.manifests[]?.annotations]' >&2 || true
  fi
  if [ -z "$manifest" ] && [ -z "$index" ]; then
    echo "Archive has neither manifest.json nor index.json." >&2
  fi
  return 1
}
