#!/bin/bash
set -e

# ==========================================
# Enterprise Health Check Script
# ==========================================

BASE_URL="${1:-http://localhost:4173}"
TIMEOUT=10
MAX_RETRIES=5
RETRY_DELAY=5

echo "=========================================="
echo "Health Check: $BASE_URL"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_endpoint() {
    local url=$1
    local expected_status=${2:-200}
    local description=$3

    echo -n "Checking $description... "

    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}"         --max-time $TIMEOUT         "$url" 2>/dev/null || echo "000|0")

    STATUS=$(echo "$RESPONSE" | cut -d'|' -f1)
    TIME=$(echo "$RESPONSE" | cut -d'|' -f2)

    if [ "$STATUS" = "$expected_status" ]; then
        echo -e "${GREEN}✓ OK${NC} (${TIME}s)"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (Status: $STATUS, Expected: $expected_status)"
        return 1
    fi
}

check_headers() {
    local url=$1

    echo -n "Checking security headers... "

    HEADERS=$(curl -sI --max-time $TIMEOUT "$url" 2>/dev/null || true)

    MISSING=0

    if ! echo "$HEADERS" | grep -qi "x-frame-options"; then
        echo -e "\n  ${YELLOW}⚠ Missing: X-Frame-Options${NC}"
        MISSING=$((MISSING + 1))
    fi

    if ! echo "$HEADERS" | grep -qi "x-content-type-options"; then
        echo -e "\n  ${YELLOW}⚠ Missing: X-Content-Type-Options${NC}"
        MISSING=$((MISSING + 1))
    fi

    if ! echo "$HEADERS" | grep -qi "content-security-policy"; then
        echo -e "\n  ${YELLOW}⚠ Missing: Content-Security-Policy${NC}"
        MISSING=$((MISSING + 1))
    fi

    if [ $MISSING -eq 0 ]; then
        echo -e "${GREEN}✓ All present${NC}"
    fi
}

check_performance() {
    local url=$1

    echo -n "Checking response time... "

    TIME=$(curl -s -o /dev/null -w "%{time_total}"         --max-time $TIMEOUT         "$url" 2>/dev/null || echo "999")

    TIME_MS=$(echo "$TIME * 1000" | bc | cut -d'.' -f1)

    if [ "$TIME_MS" -lt 500 ]; then
        echo -e "${GREEN}✓ Fast${NC} (${TIME}s)"
    elif [ "$TIME_MS" -lt 2000 ]; then
        echo -e "${YELLOW}⚠ Acceptable${NC} (${TIME}s)"
    else
        echo -e "${RED}✗ Slow${NC} (${TIME}s)"
    fi
}

# Wait for service to be ready
echo "Waiting for service to be ready..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -o /dev/null --max-time $TIMEOUT "$BASE_URL/" 2>/dev/null; then
        echo -e "${GREEN}Service is ready!${NC}"
        break
    fi
    echo "Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES: Service not ready, waiting ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Service failed to start within expected time${NC}"
    exit 1
fi

echo ""
echo "Running checks..."
echo "------------------------------------------"

# Check all pages
FAILED=0

check_endpoint "$BASE_URL/" 200 "Home page" || FAILED=$((FAILED + 1))
check_endpoint "$BASE_URL/about" 200 "About page" || FAILED=$((FAILED + 1))
check_endpoint "$BASE_URL/contact" 200 "Contact page" || FAILED=$((FAILED + 1))

echo ""
check_headers "$BASE_URL/"
check_performance "$BASE_URL/"

echo ""
echo "=========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed! ✓${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}$FAILED check(s) failed! ✗${NC}"
    echo "=========================================="
    exit 1
fi
