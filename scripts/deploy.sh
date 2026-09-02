#!/bin/bash
set -euo pipefail

# ==========================================
# Enterprise Deployment Script (Docker)
# Pulls a CI-built image from GHCR and runs it.
# ==========================================

ENVIRONMENT="${1:-staging}"
PORT="${PORT:-4173}"
APP_NAME="${APP_NAME:-enterprise-react-app}"
STATE_DIR="${STATE_DIR:-/opt/enterprise-react-app}"
PREVIOUS_IMAGE_FILE="${STATE_DIR}/previous-image.txt"
CURRENT_IMAGE_FILE="${STATE_DIR}/current-image.txt"
IMAGE="${IMAGE:-}"

echo "=========================================="
echo "Deploying to: $ENVIRONMENT"
echo "App Name: $APP_NAME"
echo "Port: $PORT"
echo "Image: ${IMAGE:-<not set>}"
echo "=========================================="

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Error: Environment must be 'staging' or 'production'"
    exit 1
fi

if [ -z "$IMAGE" ]; then
    echo "Error: IMAGE is required (e.g. ghcr.io/owner/repo:abc1234)"
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
    PREV_IMAGE="$(docker inspect --format='{{.Image}}' "$APP_NAME" 2>/dev/null || true)"
    if [ -n "${PREV_IMAGE:-}" ]; then
        echo "$PREV_IMAGE" > "$PREVIOUS_IMAGE_FILE"
        echo "Recorded previous image for rollback: $PREV_IMAGE"
    fi
elif [ -f "$CURRENT_IMAGE_FILE" ]; then
    cp "$CURRENT_IMAGE_FILE" "$PREVIOUS_IMAGE_FILE"
    echo "Recorded previous image from state file."
fi

echo "Pulling image..."
docker pull "$IMAGE"

echo "Stopping existing container (if any)..."
docker stop "$APP_NAME" >/dev/null 2>&1 || true
docker rm "$APP_NAME" >/dev/null 2>&1 || true

echo "Starting container on host port $PORT -> container 80..."
docker run -d \
    --restart unless-stopped \
    --name "$APP_NAME" \
    -p "${PORT}:80" \
    "$IMAGE"

echo "$IMAGE" > "$CURRENT_IMAGE_FILE"

echo "Waiting for service to stabilize..."
sleep 5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "${SCRIPT_DIR}/health-check.sh" ]; then
    echo "Running health checks..."
    "${SCRIPT_DIR}/health-check.sh" "http://localhost:$PORT"
elif [ -x "./scripts/health-check.sh" ]; then
    echo "Running health checks..."
    ./scripts/health-check.sh "http://localhost:$PORT"
else
    echo "health-check.sh not found locally; probing with curl..."
    curl -sf "http://localhost:$PORT/" >/dev/null
fi

echo ""
echo "=========================================="
echo "Deployment to $ENVIRONMENT complete!"
echo "=========================================="
