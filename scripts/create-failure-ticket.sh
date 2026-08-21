#!/usr/bin/env bash
# Create or update a GitHub Issue when CI/CD stages fail on main.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GH_REPO:?GH_REPO is required}"
: "${RUN_URL:?RUN_URL is required}"
: "${SHA:?SHA is required}"
: "${ACTOR:?ACTOR is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"

CODE_QUALITY="${CODE_QUALITY:-unknown}"
SECURITY_SCAN="${SECURITY_SCAN:-unknown}"
UNIT_TESTS="${UNIT_TESTS:-unknown}"
BUILD="${BUILD:-unknown}"
E2E_TESTS="${E2E_TESTS:-unknown}"
DEPLOY_STAGING="${DEPLOY_STAGING:-unknown}"

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

FAILED_STAGES=()
LABELS=("ci-failure" "bug" "needs-triage")

add_stage() {
  local result="$1"
  local label="$2"
  if [ "$result" = "failure" ]; then
    FAILED_STAGES+=("$label")
  fi
}

add_stage "$CODE_QUALITY" "Code Quality Checks"
add_stage "$SECURITY_SCAN" "Security Analysis"
add_stage "$UNIT_TESTS" "Unit Tests"
add_stage "$BUILD" "Build & Bundle Analysis"
add_stage "$E2E_TESTS" "E2E Tests"
add_stage "$DEPLOY_STAGING" "Deploy to Staging"

if [ ${#FAILED_STAGES[@]} -eq 0 ]; then
  echo "No failed stages detected; skipping ticket creation."
  exit 0
fi

if [ "$SECURITY_SCAN" = "failure" ]; then
  LABELS+=("security")
fi

STAGES_CSV=$(IFS=', '; echo "${FAILED_STAGES[*]}")
SHORT_SHA="${SHA:0:7}"
TITLE="[CI Failure]: ${STAGES_CSV} failed on main (${SHORT_SHA})"

EXISTING_ISSUE=$(gh issue list \
  --repo "$GH_REPO" \
  --state open \
  --label "ci-failure" \
  --search "\"[CI Failure]: ${STAGES_CSV} failed on main\" in:title" \
  --json number,url \
  --jq '.[0].url // empty')

if [ -n "$EXISTING_ISSUE" ]; then
  echo "Open ticket already exists: $EXISTING_ISSUE"
  gh issue comment "$EXISTING_ISSUE" --repo "$GH_REPO" --body "$(cat <<EOF
### Recurring CI failure

Another pipeline run failed with the same stage(s).

| Field | Value |
| --- | --- |
| Run | ${RUN_URL} |
| Commit | \`${SHA}\` |
| Actor | @${ACTOR} |
| Event | \`${EVENT_NAME}\` |
| Failed stages | ${STAGES_CSV} |

Please investigate, choose \`fix/auto\` or \`fix/manual\` on this issue, and close once \`main\` is green.
EOF
)"
  echo "Commented on existing ticket instead of creating a duplicate."
  exit 0
fi

FAILED_LIST=$(printf -- '- [ ] %s\n' "${FAILED_STAGES[@]}")

BODY=$(cat <<EOF
## Automated CI/CD failure ticket

The Enterprise CI/CD pipeline detected one or more failing stages on \`main\`.

### Failed stages
${FAILED_LIST}

### Run details
| Field | Value |
| --- | --- |
| Workflow run | ${RUN_URL} |
| Commit | \`${SHA}\` |
| Actor | @${ACTOR} |
| Event | \`${EVENT_NAME}\` |
| Branch | \`main\` |

### Job results
| Stage | Result |
| --- | --- |
| Code Quality Checks | \`${CODE_QUALITY}\` |
| Security Analysis | \`${SECURITY_SCAN}\` |
| Unit Tests | \`${UNIT_TESTS}\` |
| Build & Bundle Analysis | \`${BUILD}\` |
| E2E Tests | \`${E2E_TESTS}\` |
| Deploy to Staging | \`${DEPLOY_STAGING}\` |

### Developer approval — choose a fix path

Auto-fix is **paused** until a developer chooses:

| Choice | How to select | What happens |
| --- | --- | --- |
| **Auto fix** | Add label \`fix/auto\` to this issue | CI runs \`lint:fix\` and Prettier, then commits to \`main\` (no \`npm audit fix\`) |
| **Manual fix** | Add label \`fix/manual\` to this issue | CI does not change code; you fix locally / via PR |

You can also run **Actions → Developer Fix Choice → Run workflow** and select \`auto\` or \`manual\`.

### Next steps
1. Inspect the [workflow run](${RUN_URL}) logs.
2. Add \`fix/auto\` **or** \`fix/manual\` (manual approval).
3. Confirm \`main\` is green after the fix.
4. Close this issue when resolved.

> Track tickets in **GitHub Issues**. Optionally add them to a **GitHub Project** board.
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
