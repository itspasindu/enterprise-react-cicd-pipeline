#!/usr/bin/env bash
# Create or update a detailed GitHub Issue when CI/CD stages fail on main.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ci-report-lib.sh
source "${SCRIPT_DIR}/lib/ci-report-lib.sh"

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GH_REPO:?GH_REPO is required}"
: "${RUN_URL:?RUN_URL is required}"
: "${SHA:?SHA is required}"
: "${ACTOR:?ACTOR is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"

RUN_ID="${RUN_ID:-}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-}"
REF_NAME="${REF_NAME:-main}"
WORKFLOW_NAME="${WORKFLOW_NAME:-CI/CD Pipeline}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$GH_REPO}"

if [ -z "$COMMIT_MESSAGE" ] && command -v gh >/dev/null 2>&1; then
  COMMIT_MESSAGE="$(GH_TOKEN="$GH_TOKEN" gh api "repos/${GH_REPO}/commits/${SHA}" \
    --jq '.commit.message | split("\n")[0]' 2>/dev/null || true)"
fi

CODE_QUALITY="${CODE_QUALITY:-unknown}"
SECURITY_SCAN="${SECURITY_SCAN:-unknown}"
UNIT_TESTS="${UNIT_TESTS:-unknown}"
BUILD="${BUILD:-unknown}"
E2E_TESTS="${E2E_TESTS:-unknown}"
DOCKER_BUILD_PUSH="${DOCKER_BUILD_PUSH:-unknown}"
DEPLOY_STAGING="${DEPLOY_STAGING:-unknown}"

export GITHUB_REPOSITORY

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  if ! gh label list --repo "$GH_REPO" --json name --jq '.[].name' | grep -Fxq "$name"; then
    gh label create "$name" --repo "$GH_REPO" --color "$color" --description "$description" || true
  fi
}

ensure_label "ci-failure" "D73A4A" "Automated ticket from a failed CI/CD stage"
ensure_label "bug" "B60205" "Something is broken"
ensure_label "security" "B60205" "Security-related failure"
ensure_label "needs-triage" "FBCA04" "Needs investigation"
ensure_label "fix/auto" "0E8A16" "Approve automated CI auto-fix"
ensure_label "fix/manual" "1D76DB" "Developer will fix manually"
ensure_label "ci/quality" "C5DEF5" "Code quality stage failure"
ensure_label "ci/security" "F9D0C4" "Security scan stage failure"
ensure_label "ci/tests" "BFDADC" "Unit test stage failure"
ensure_label "ci/build" "D4C5F9" "Build stage failure"
ensure_label "ci/e2e" "FEF2C0" "E2E test stage failure"
ensure_label "ci/docker" "C2E0C6" "Docker build/push stage failure"
ensure_label "ci/deploy" "FBCA04" "Staging deploy stage failure"
ensure_label "priority/high" "B60205" "High priority — blocks main"
ensure_label "priority/critical" "8B0000" "Critical — security or production path"

declare -a FAILED_STAGE_KEYS=()
declare -a FAILED_STAGE_NAMES=()
LABELS=("ci-failure" "bug" "needs-triage" "priority/high")

record_failure() {
  local result="$1"
  local key="$2"
  if [ "$result" = "failure" ]; then
    FAILED_STAGE_KEYS+=("$key")
    FAILED_STAGE_NAMES+=("$(stage_display_name "$key")")
    local stage_label
    stage_label="$(stage_issue_label "$key")"
    if [ -n "$stage_label" ]; then
      LABELS+=("$stage_label")
    fi
  fi
}

record_failure "$CODE_QUALITY" "code-quality"
record_failure "$SECURITY_SCAN" "security-scan"
record_failure "$UNIT_TESTS" "unit-tests"
record_failure "$BUILD" "build"
record_failure "$E2E_TESTS" "e2e-tests"
record_failure "$DOCKER_BUILD_PUSH" "docker-build-push"
record_failure "$DEPLOY_STAGING" "deploy-staging"

if [ ${#FAILED_STAGE_KEYS[@]} -eq 0 ]; then
  echo "No failed stages detected; skipping ticket creation."
  exit 0
fi

if [ "$SECURITY_SCAN" = "failure" ]; then
  LABELS+=("security" "priority/critical")
fi

UNIQUE_LABELS=()
for label in "${LABELS[@]}"; do
  skip=false
  for u in "${UNIQUE_LABELS[@]:-}"; do
    if [ "$u" = "$label" ]; then skip=true; break; fi
  done
  if [ "$skip" = false ]; then
    UNIQUE_LABELS+=("$label")
  fi
done
LABELS=("${UNIQUE_LABELS[@]}")

STAGES_CSV=$(IFS=', '; echo "${FAILED_STAGE_NAMES[*]}")
SHORT_SHA="${SHA:0:7}"
SEVERITY_PREFIX="[CI Failure]"
if [ "$SECURITY_SCAN" = "failure" ]; then
  SEVERITY_PREFIX="[CI Security Failure]"
fi
TITLE="${SEVERITY_PREFIX}: ${STAGES_CSV} on ${REF_NAME} (${SHORT_SHA})"

fetch_job_urls "$RUN_ID" "$GH_REPO"

JOB_LOGS_MD="| Stage | Status | Logs |"
JOB_LOGS_MD+=$'\n'"| --- | --- | --- |"
for key in code-quality security-scan unit-tests build e2e-tests docker-build-push deploy-staging; do
  result_var=""
  case "$key" in
    code-quality) result_var="$CODE_QUALITY" ;;
    security-scan) result_var="$SECURITY_SCAN" ;;
    unit-tests) result_var="$UNIT_TESTS" ;;
    build) result_var="$BUILD" ;;
    e2e-tests) result_var="$E2E_TESTS" ;;
    docker-build-push) result_var="$DOCKER_BUILD_PUSH" ;;
    deploy-staging) result_var="$DEPLOY_STAGING" ;;
  esac
  log_cell="n/a"
  if [ "$result_var" = "failure" ]; then
    url="$(job_url_for_stage "$key")"
    if [ -n "$url" ]; then
      log_cell="[View logs](${url})"
    else
      log_cell="[Workflow run](${RUN_URL})"
    fi
  elif [ "$result_var" = "success" ]; then
    log_cell="—"
  fi
  JOB_LOGS_MD+=$'\n'"| $(stage_display_name "$key") | \`${result_var}\` | ${log_cell} |"
done

TROUBLESHOOTING_MD=""
for key in "${FAILED_STAGE_KEYS[@]}"; do
  TROUBLESHOOTING_MD+="$(stage_troubleshooting_md "$key")"$'\n\n'
done

PRIMARY_KEY="${FAILED_STAGE_KEYS[0]}"
REPRO_CMD="$(stage_reproduce_cmd "$PRIMARY_KEY")"
FAILED_CHECKLIST=$(printf -- '- [ ] **%s** — investigate and resolve\n' "${FAILED_STAGE_NAMES[@]}")

COMMIT_LINE="\`${SHA}\`"
if [ -n "$COMMIT_MESSAGE" ]; then
  COMMIT_LINE="\`${SHA}\` — ${COMMIT_MESSAGE}"
fi

COMPARE_URL="https://github.com/${GH_REPO}/commit/${SHA}"
ARTIFACTS_URL="${RUN_URL}#artifacts"

EXISTING_ISSUE=$(gh issue list \
  --repo "$GH_REPO" \
  --state open \
  --label "ci-failure" \
  --search "\"${STAGES_CSV}\" in:title" \
  --json number,url \
  --jq '.[0].url // empty' 2>/dev/null || true)

if [ -n "$EXISTING_ISSUE" ]; then
  echo "Open ticket already exists: $EXISTING_ISSUE"
  gh issue comment "$EXISTING_ISSUE" --repo "$GH_REPO" --body "$(cat <<EOF
### Recurring pipeline failure

Another run failed with the same stage(s).

| Field | Value |
| --- | --- |
| Workflow | ${WORKFLOW_NAME} |
| Run | [#${RUN_ID:-?}](${RUN_URL}) |
| Commit | ${COMMIT_LINE} |
| Branch | \`${REF_NAME}\` |
| Actor | @${ACTOR} |
| Event | \`${EVENT_NAME}\` |
| Failed stages | ${STAGES_CSV} |

#### Failed stage checklist
${FAILED_CHECKLIST}

#### Quick links
- [Download artifacts](${ARTIFACTS_URL})
- [Commit diff](${COMPARE_URL})

---
_Add \`fix/auto\` or \`fix/manual\` if not already chosen. Close when \`${REF_NAME}\` is green._
EOF
)"
  echo "Commented on existing ticket instead of creating a duplicate."
  exit 0
fi

BODY=$(cat <<EOF
## Pipeline failure report

> Automated ticket from **${WORKFLOW_NAME}**. One or more required stages failed on \`${REF_NAME}\`.

### Summary

| Field | Value |
| --- | --- |
| **Overall** | ❌ Failed (${STAGES_CSV}) |
| **Workflow run** | [#${RUN_ID:-?}](${RUN_URL}) |
| **Commit** | [${SHORT_SHA}](${COMPARE_URL}) |
| **Message** | ${COMMIT_MESSAGE:-_(not available)_} |
| **Branch** | \`${REF_NAME}\` |
| **Triggered by** | @${ACTOR} (\`${EVENT_NAME}\`) |
| **Artifacts** | [Download from run](${ARTIFACTS_URL}) |

---

### Failed stages (resolution checklist)

${FAILED_CHECKLIST}

---

### All stage results

${JOB_LOGS_MD}

---

### Investigation guide

${TROUBLESHOOTING_MD}

---

### Reproduce locally (primary failure: $(stage_display_name "$PRIMARY_KEY"))

\`\`\`bash
git checkout ${SHA}
${REPRO_CMD}
\`\`\`

---

### Developer fix path (approval required)

Auto-fix is **paused** until a developer chooses:

| Choice | How to select | What happens |
| --- | --- | --- |
| **Auto fix** | Add label \`fix/auto\` to this issue | Runs \`lint:fix\` + Prettier, commits to \`${REF_NAME}\` (never \`npm audit fix\`) |
| **Manual fix** | Add label \`fix/manual\` to this issue | No CI code changes; fix via local branch / PR |

Or: **Actions → Developer Fix Choice → Run workflow** → select \`auto\` or \`manual\`.

---

### Resolution workflow

1. Open the [workflow run](${RUN_URL}) and failed job logs (table above).
2. Download artifacts (\`playwright-report\`, \`coverage-report\`, \`build-artifact\`) if relevant.
3. Add \`fix/auto\` **or** \`fix/manual\`.
4. Apply fix; confirm a green run on \`${REF_NAME}\`.
5. Check off stages above and **close this issue**.

### References

- [CI/CD Pipeline docs](https://github.com/${GH_REPO}/blob/main/docs/CI-CD-PIPELINE.md)
- [Setup guide](https://github.com/${GH_REPO}/blob/main/docs/SETUP-GUIDE.md)
- [Wiki — Troubleshooting](https://github.com/${GH_REPO}/wiki/Troubleshooting)
- [Open CI failure issues](https://github.com/${GH_REPO}/issues?q=is%3Aissue+is%3Aopen+label%3Aci-failure)

---
_Auto-generated by \`scripts/create-failure-ticket.sh\`_
EOF
)

LABEL_ARGS=()
for label in "${LABELS[@]}"; do
  LABEL_ARGS+=(--label "$label")
done

ISSUE_URL=$(gh issue create \
  --repo "$GH_REPO" \
  --title "$TITLE" \
  --body "$BODY" \
  "${LABEL_ARGS[@]}")

echo "Created failure ticket: $ISSUE_URL"
