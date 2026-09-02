#!/usr/bin/env bash
# Shared helpers for CI wiki reports and failure tickets.
# Source from publish-wiki-report.sh and create-failure-ticket.sh (do not execute directly).

status_icon() {
  case "$1" in
    success) echo "✅ success" ;;
    failure) echo "❌ failure" ;;
    cancelled) echo "⛔ cancelled" ;;
    skipped) echo "⏭️ skipped" ;;
    *) echo "❔ $1" ;;
  esac
}

status_badge() {
  case "$1" in
    success) echo "🟢" ;;
    failure) echo "🔴" ;;
    cancelled) echo "🟡" ;;
    skipped) echo "⚪" ;;
    *) echo "⚫" ;;
  esac
}

# stage_key → human name
stage_display_name() {
  case "$1" in
    code-quality) echo "Code Quality Checks" ;;
    security-scan) echo "Security Analysis" ;;
    await-fix-decision) echo "Await Developer Fix Decision" ;;
    unit-tests) echo "Unit Tests" ;;
    build) echo "Build & Bundle Analysis" ;;
    e2e-tests) echo "E2E Tests" ;;
    docker-build-push) echo "Build & Push Docker Image" ;;
    deploy-staging) echo "Deploy to Staging" ;;
    failure-ticket) echo "Failure Ticket" ;;
    *) echo "$1" ;;
  esac
}

# stage_key → GitHub Actions job name (for log lookup)
stage_job_name() {
  case "$1" in
    code-quality) echo "Code Quality Checks" ;;
    security-scan) echo "Security Analysis" ;;
    await-fix-decision) echo "Await Developer Fix Decision" ;;
    unit-tests) echo "Unit Tests" ;;
    build) echo "Build & Bundle Analysis" ;;
    e2e-tests) echo "E2E Tests" ;;
    docker-build-push) echo "Build & Push Docker Image" ;;
    deploy-staging) echo "Deploy to Staging" ;;
    failure-ticket) echo "Create Failure Ticket" ;;
    *) echo "" ;;
  esac
}

# stage_key → issue label
stage_issue_label() {
  case "$1" in
    code-quality) echo "ci/quality" ;;
    security-scan) echo "ci/security" ;;
    unit-tests) echo "ci/tests" ;;
    build) echo "ci/build" ;;
    e2e-tests) echo "ci/e2e" ;;
    docker-build-push) echo "ci/docker" ;;
    deploy-staging) echo "ci/deploy" ;;
    *) echo "" ;;
  esac
}

# stage_key → local reproduce command
stage_reproduce_cmd() {
  case "$1" in
    code-quality)
      cat <<'EOF'
npm ci
npm run lint
npm run format:check
npx tsc --noEmit
EOF
      ;;
    security-scan)
      cat <<'EOF'
npm ci
npm audit --audit-level=high
# Also review CodeQL / Trivy SARIF in the Actions Security tab
EOF
      ;;
    unit-tests)
      cat <<'EOF'
npm ci
npm run test:coverage
EOF
      ;;
    build)
      cat <<'EOF'
npm ci
npm run build
# Optional: npm run sbom (if configured in workflow)
EOF
      ;;
    e2e-tests)
      cat <<'EOF'
npm ci
npm run build
npx vite preview --port 4173 &
npm run test:e2e
EOF
      ;;
    docker-build-push)
      cat <<'EOF'
npm ci && npm run build
docker build -t local-test .
# Verify GHCR login and image tags in workflow logs
EOF
      ;;
    deploy-staging)
      cat <<'EOF'
# On staging host:
cd /opt/enterprise-react-app
IMAGE=ghcr.io/<owner>/<repo>:<sha> ./scripts/deploy.sh staging
./scripts/health-check.sh
EOF
      ;;
    *)
      echo "# See workflow logs for this stage"
      ;;
  esac
}

# stage_key → markdown troubleshooting block
stage_troubleshooting_md() {
  local key="$1"
  local name
  name="$(stage_display_name "$key")"

  case "$key" in
    code-quality)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| ESLint errors | Run \`npm run lint:fix\` locally; commit fixes |
| Prettier drift | Run \`npm run format\` |
| TypeScript errors | Run \`npx tsc --noEmit\` and fix reported files |
| Flaky on CI only | Confirm \`package-lock.json\` is committed; use \`npm ci\` |

**Docs:** [CI-CD-PIPELINE.md — Code Quality](https://github.com/${GITHUB_REPOSITORY:-ORG/REPO}/blob/main/docs/CI-CD-PIPELINE.md)
EOF
      ;;
    security-scan)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| \`npm audit\` (high/critical) | Upgrade vulnerable packages in a reviewed PR — CI never runs \`npm audit fix\` |
| TruffleHog (secrets) | Rotate exposed credentials; remove secrets from history |
| CodeQL alerts | Open **Security → Code scanning**; fix or dismiss with justification |
| Trivy (filesystem / image) | Patch base image or dependencies; review SARIF upload |

**Priority:** Treat as **high** until resolved. Add label \`security\` if not already present.
EOF
      ;;
    unit-tests)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| Failing assertions | Run \`npm run test:coverage\` locally on the failing commit |
| Coverage upload | Ensure tests write to \`coverage/\` as configured in Vitest |
| Timeout / OOM | Split large tests; check for open handles |

Download **coverage-report** from the Actions run artifacts for HTML/LCOV details.
EOF
      ;;
    build)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| Vite build errors | Run \`npm run build\` locally with the same \`VITE_*\` env vars |
| SBOM / bundle step | Confirm CycloneDX output path matches workflow |
| Attestation | Requires \`id-token: write\`; check org/repo Actions permissions |

Artifacts: \`build-artifact\`, \`app-dist-<sha>-bundle\`.
EOF
      ;;
    e2e-tests)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| Selector strict mode | Use role + visible filters (see \`tests/e2e/\`) |
| Mobile viewports | Open mobile nav before asserting hidden links |
| Preview server | E2E uses downloaded \`build-artifact\`, not a fresh build |
| Browser-specific | Filter playwright-report by project (chromium, firefox, webkit) |

Download **playwright-report** from Actions artifacts for traces and screenshots.
EOF
      ;;
    docker-build-push)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| Dockerfile / context | Run \`docker build .\` locally |
| GHCR push denied | Verify \`GITHUB_TOKEN\` / \`packages: write\` permissions |
| Trivy image scan | Review CRITICAL/HIGH findings in Security tab |
| Missing dist | Build job must succeed first; image copies prebuilt \`dist/\` |

Image tags: \`ghcr.io/<owner>/<repo>:<sha>\` and \`:staging\`.
EOF
      ;;
    deploy-staging)
      cat <<EOF
#### ${name}

| Check | Action |
| --- | --- |
| SSH / known_hosts | Verify \`STAGING_SSH_KNOWN_HOSTS\` fingerprint matches server |
| Tailscale | If using private VM, confirm \`TAILSCALE_AUTHKEY\` on staging environment |
| Docker on host | Deploy user must be in \`docker\` group; \`docker info\` must work |
| GHCR pull | Set \`GHCR_PULL_TOKEN\` (read:packages) on staging environment |
| Health check | \`curl -I http://<host>:4173/\` — app listens on port **4173** |
| Rollback | Previous image stored in \`/opt/enterprise-react-app/previous-image.txt\` |

**Docs:** [SETUP-GUIDE.md](https://github.com/${GITHUB_REPOSITORY:-ORG/REPO}/blob/main/docs/SETUP-GUIDE.md)
EOF
      ;;
    *)
      echo "#### ${name}"$'\n'"See workflow logs for this stage."
      ;;
  esac
}

# Fetch job log URLs from GitHub API (requires gh + GH_TOKEN)
# Sets associative array JOB_URLS if bash 4+, else writes to /tmp/ci-job-urls.*
fetch_job_urls() {
  local run_id="$1"
  local repo="$2"
  local token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

  JOB_URL_LIST=""
  if [ -z "$token" ] || [ -z "$run_id" ] || [ -z "$repo" ]; then
    return 0
  fi

  if ! command -v gh >/dev/null 2>&1; then
    return 0
  fi

  local json
  json="$(GH_TOKEN="$token" gh run view "$run_id" --repo "$repo" --json jobs 2>/dev/null || true)"
  if [ -z "$json" ]; then
    return 0
  fi

  JOB_URL_LIST="$json"
}

job_url_for_stage() {
  local stage_key="$1"
  local job_name
  job_name="$(stage_job_name "$stage_key")"
  [ -z "$job_name" ] && return 0

  if [ -z "${JOB_URL_LIST:-}" ]; then
    echo ""
    return 0
  fi

  echo "$JOB_URL_LIST" | jq -r --arg name "$job_name" \
    '.jobs[] | select(.name == $name) | .url' 2>/dev/null | head -n 1
}

format_job_link() {
  local stage_key="$1"
  local url
  url="$(job_url_for_stage "$stage_key")"
  local name
  name="$(stage_display_name "$stage_key")"

  if [ -n "$url" ]; then
    printf '[%s](%s)' "$name" "$url"
  else
    printf '%s' "$name"
  fi
}

compute_overall_status() {
  local overall="success"
  local result
  for result in "$@"; do
    if [ "$result" = "failure" ]; then
      echo "failure"
      return 0
    fi
  done
  for result in "$@"; do
    if [ "$result" = "cancelled" ]; then
      echo "cancelled"
      return 0
    fi
  done
  echo "success"
}

list_open_ci_issues() {
  local repo="$1"
  local token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

  if [ -z "$token" ] || ! command -v gh >/dev/null 2>&1; then
    echo ""
    return 0
  fi

  GH_TOKEN="$token" gh issue list \
    --repo "$repo" \
    --state open \
    --label "ci-failure" \
    --limit 10 \
    --json number,title,url \
    --jq '.[] | "- [#\(.number) \(.title)](\(.url))"' 2>/dev/null || true
}
