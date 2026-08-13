#!/bin/bash
set -euo pipefail

# ==========================================
# Enterprise Deployment Script
# Supports promoting a CI prebuilt dist (build once).
# ==========================================

ENVIRONMENT="${1:-staging}"
PORT="${PORT:-4173}"
APP_NAME="${APP_NAME:-enterprise-react-app}"
USE_PREBUILT_DIST="${USE_PREBUILT_DIST:-false}"

echo "=========================================="
echo "Deploying to: $ENVIRONMENT"
echo "App Name: $APP_NAME"
echo "Port: $PORT"
echo "Use prebuilt dist: $USE_PREBUILT_DIST"
echo "=========================================="

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Error: Environment must be 'staging' or 'production'"
    exit 1
fi

if [ -f ".env.$ENVIRONMENT" ]; then
    echo "Loading environment variables..."
    set -a
    # shellcheck disable=SC1090
    source ".env.$ENVIRONMENT"
    set +a
fi

echo "Installing dependencies..."
npm ci --prefer-offline --no-audit

if [ "$USE_PREBUILT_DIST" = "true" ]; then
    if [ ! -f "dist/index.html" ]; then
        echo "Error: USE_PREBUILT_DIST=true but dist/index.html is missing"
        exit 1
    fi
    echo "Using CI prebuilt dist artifact (skipping remote build)"
else
    echo "Building application on server..."
    npm run build
fi

if ! command -v pm2 >/dev/null 2>&1; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi

echo "Starting application with PM2..."
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start "npm run start -- --host 0.0.0.0 --port $PORT" --name "$APP_NAME"
pm2 save

echo "Waiting for service to stabilize..."
sleep 15

echo "Running health checks..."
./scripts/health-check.sh "http://localhost:$PORT"

echo ""
echo "=========================================="
echo "Deployment to $ENVIRONMENT complete!"
echo "=========================================="
