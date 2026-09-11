#!/bin/bash
set -euo pipefail

# ==========================================
# Staging/production deploy (Docker)
# IMAGE may be a tag or digest ref (repo@sha256:...).
# Prefer SKIP_PULL=1 after CI streams via docker save/load.
# ==========================================

ENVIRONMENT="${1:-staging}"
PORT="${PORT:-4173}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"
APP_NAME="${APP_NAME:-enterprise-react-app}"
STATE_DIR="${STATE_DIR:-/opt/enterprise-react-app}"
PREVIOUS_IMAGE_FILE="${STATE_DIR}/previous-image.txt"
CURRENT_IMAGE_FILE="${STATE_DIR}/current-image.txt"
IMAGE="${IMAGE:-}"
SKIP_PULL="${SKIP_PULL:-0}"
MEMORY_LIMIT="${MEMORY_LIMIT:-256m}"
CPU_LIMIT="${CPU_LIMIT:-0.50}"
PIDS_LIMIT="${PIDS_LIMIT:-256}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-90}"

echo "=========================================="
echo "Deploying to: $ENVIRONMENT"
echo "App Name: $APP_NAME"
echo "Port: $PORT -> container $CONTAINER_PORT"
echo "Image: ${IMAGE:-<not set>}"
echo "Skip pull: $SKIP_PULL"
echo "=========================================="

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Error: Environment must be 'staging' or 'production'"
    exit 1
fi

if [ -z "$IMAGE" ]; then
    echo "Error: IMAGE is required (e.g. ghcr.io/owner/platform@sha256:...)"
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is not installed or not on PATH."
    echo "Install Docker Engine and add the deploy user to the docker group."
    echo "See docs/SETUP-GUIDE.md"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Error: cannot talk to the Docker daemon (permission denied?)."
    echo "Add the deploy user to the docker group, then re-login."
    exit 1
fi

mkdir -p "$STATE_DIR"

# Remember the currently running image for rollback before we replace it.
if docker inspect "$APP_NAME" >/dev/null 2>&1; then
    PREV_IMAGE="$(docker inspect --format='{{.Config.Image}}' "$APP_NAME" 2>/dev/null || true)"
    if [ -z "${PREV_IMAGE:-}" ]; then
        PREV_IMAGE="$(docker inspect --format='{{.Image}}' "$APP_NAME" 2>/dev/null || true)"
    fi
    if [ -n "${PREV_IMAGE:-}" ]; then
        echo "$PREV_IMAGE" > "$PREVIOUS_IMAGE_FILE"
        echo "Recorded previous image for rollback: $PREV_IMAGE"
    fi
elif [ -f "$CURRENT_IMAGE_FILE" ]; then
    cp "$CURRENT_IMAGE_FILE" "$PREVIOUS_IMAGE_FILE"
    echo "Recorded previous image from state file."
fi

if [ "$SKIP_PULL" != "1" ] && [ "$SKIP_PULL" != "true" ]; then
    echo "Pulling image from registry..."
    docker pull "$IMAGE"
else
    echo "Skipping registry pull (image should already be loaded on this host)."
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
        echo "Error: image '$IMAGE' is not present locally. Load it first (docker load) or unset SKIP_PULL."
        exit 1
    fi
fi

echo "Stopping existing container (if any)..."
docker stop "$APP_NAME" >/dev/null 2>&1 || true
docker rm "$APP_NAME" >/dev/null 2>&1 || true

free_port() {
    local port="$1"
    local pids=""

    if command -v ss >/dev/null 2>&1; then
        pids="$(ss -tlnp "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
    elif command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    fi

    if command -v pm2 >/dev/null 2>&1; then
        echo "Stopping PM2 process '${APP_NAME}' (if running)..."
        pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
        pm2 save >/dev/null 2>&1 || true
    fi

    if [ -n "${pids}" ]; then
        echo "Port ${port} still in use by PID(s): ${pids} — stopping..."
        # shellcheck disable=SC2086
        kill ${pids} >/dev/null 2>&1 || true
        sleep 2
        # shellcheck disable=SC2086
        kill -9 ${pids} >/dev/null 2>&1 || true
    fi

    if command -v ss >/dev/null 2>&1 && ss -tln "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
        echo "Error: port ${port} is still in use after cleanup."
        ss -tlnp "sport = :${port}" || true
        exit 1
    fi
}

run_hardened_container() {
    local image_ref="$1"
    docker run -d \
        --restart unless-stopped \
        --name "$APP_NAME" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=16m \
        --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=32m \
        --tmpfs /var/run:rw,noexec,nosuid,size=8m \
        --cap-drop ALL \
        --security-opt no-new-privileges:true \
        --memory "$MEMORY_LIMIT" \
        --cpus "$CPU_LIMIT" \
        --pids-limit "$PIDS_LIMIT" \
        -p "${PORT}:${CONTAINER_PORT}" \
        "$image_ref"
}

wait_for_container_health() {
    local name="$1"
    local deadline=$((SECONDS + HEALTH_WAIT_SECONDS))
    local status=""

    echo "Waiting for Docker HEALTHCHECK (up to ${HEALTH_WAIT_SECONDS}s)..."
    while [ "$SECONDS" -lt "$deadline" ]; do
        if ! docker inspect "$name" >/dev/null 2>&1; then
            echo "Container '$name' disappeared while waiting for health."
            return 1
        fi

        running="$(docker inspect --format='{{.State.Running}}' "$name" 2>/dev/null || echo false)"
        if [ "$running" != "true" ]; then
            echo "Container is not running:"
            docker logs "$name" 2>&1 | tail -n 40 || true
            return 1
        fi

        status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo unknown)"
        case "$status" in
            healthy)
                echo "Container health: healthy"
                return 0
                ;;
            unhealthy)
                echo "Container health: unhealthy"
                docker inspect --format='{{json .State.Health}}' "$name" || true
                docker logs "$name" 2>&1 | tail -n 40 || true
                return 1
                ;;
            starting)
                echo "Container health: starting..."
                ;;
            none)
                echo "No HEALTHCHECK defined; falling back to HTTP probe."
                return 0
                ;;
            *)
                echo "Container health: ${status}"
                ;;
        esac
        sleep 2
    done

    echo "Timed out waiting for healthy status (last: ${status:-unknown})"
    docker logs "$name" 2>&1 | tail -n 40 || true
    return 1
}

echo "Ensuring host port $PORT is free..."
free_port "$PORT"

echo "Starting hardened container on host port $PORT -> container $CONTAINER_PORT..."
run_hardened_container "$IMAGE"

echo "$IMAGE" > "$CURRENT_IMAGE_FILE"

wait_for_container_health "$APP_NAME"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "${SCRIPT_DIR}/health-check.sh" ]; then
    echo "Running HTTP health checks..."
    "${SCRIPT_DIR}/health-check.sh" "http://localhost:$PORT"
elif [ -x "./scripts/health-check.sh" ]; then
    echo "Running HTTP health checks..."
    ./scripts/health-check.sh "http://localhost:$PORT"
else
    echo "health-check.sh not found locally; probing with curl..."
    curl -sf "http://localhost:$PORT/" >/dev/null
fi

echo ""
echo "=========================================="
echo "Deployment to $ENVIRONMENT complete!"
echo "=========================================="
