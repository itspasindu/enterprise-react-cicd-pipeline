#!/usr/bin/env bash
# Publish detailed CI/CD pipeline reports to the repository GitHub Wiki.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ci-report-lib.sh
source "${SCRIPT_DIR}/lib/ci-report-lib.sh"

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${RUN_ID:?RUN_ID is required}"
: "${RUN_URL:?RUN_URL is required}"
: "${SHA:?SHA is required}"
: "${ACTOR:?ACTOR is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"
: "${WORKFLOW_NAME:?WORKFLOW_NAME is required}"

TOKEN="${WIKI_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: Set WIKI_TOKEN (recommended) or GITHUB_TOKEN to publish wiki pages."
  exit 1
fi

export GITHUB_REPOSITORY

CODE_QUALITY="${CODE_QUALITY:-unknown}"
SECURITY_SCAN="${SECURITY_SCAN:-unknown}"
AWAIT_FIX_DECISION="${AWAIT_FIX_DECISION:-skipped}"
UNIT_TESTS="${UNIT_TESTS:-unknown}"
BUILD="${BUILD:-unknown}"
E2E_TESTS="${E2E_TESTS:-unknown}"
DOCKER_BUILD_PUSH="${DOCKER_BUILD_PUSH:-unknown}"
DEPLOY_STAGING="${DEPLOY_STAGING:-unknown}"
FAILURE_TICKET="${FAILURE_TICKET:-skipped}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-}"
REF_NAME="${REF_NAME:-main}"

if [ -z "$COMMIT_MESSAGE" ] && command -v gh >/dev/null 2>&1; then
  COMMIT_MESSAGE="$(GH_TOKEN="$TOKEN" gh api "repos/${GITHUB_REPOSITORY}/commits/${SHA}" \
    --jq '.commit.message | split("\n")[0]' 2>/dev/null || true)"
fi

GH_TOKEN="${TOKEN}"
fetch_job_urls "$RUN_ID" "$GITHUB_REPOSITORY"

OVERALL="$(compute_overall_status \
  "$CODE_QUALITY" "$SECURITY_SCAN" "$UNIT_TESTS" "$BUILD" \
  "$E2E_TESTS" "$DOCKER_BUILD_PUSH" "$DEPLOY_STAGING")"

TIMESTAMP="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
DATE_STAMP="$(date -u +"%Y-%m-%d")"
SHORT_SHA="${SHA:0:7}"
REPORT_PAGE="Pipeline-Report-${DATE_STAMP}-run-${RUN_ID}"
WIKI_DIR="$(mktemp -d)"
WIKI_URL="https://x-access-token:${TOKEN}@github.com/${GITHUB_REPOSITORY}.wiki.git"

RUN_META=""
if command -v gh >/dev/null 2>&1; then
  RUN_META="$(GH_TOKEN="$TOKEN" gh run view "$RUN_ID" --repo "$GITHUB_REPOSITORY" \
    --json createdAt,updatedAt,conclusion \
    --jq '"| Started | \(.createdAt) |\n| Finished | \(.updatedAt) |\n| GitHub conclusion | \(.conclusion // "n/a") |"' 2>/dev/null || true)"
fi

cleanup() {
  rm -rf "$WIKI_DIR"
}
trap cleanup EXIT

echo "Cloning wiki repository..."
if ! git clone --depth=1 "$WIKI_URL" "$WIKI_DIR" 2>/tmp/wiki-clone-err; then
  cat /tmp/wiki-clone-err || true
  echo ""
  echo "ERROR: Unable to clone the wiki."
  echo "Ensure the repository Wiki is enabled and WIKI_TOKEN has wiki write access."
  exit 1
fi

cd "$WIKI_DIR"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if [ ! -f Pipeline-Overview.md ]; then
  cat > Pipeline-Overview.md <<'WIKIEOF'
# Pipeline Overview

This wiki documents the CI/CD pipeline that runs on every pull request and every merge to `main`.

## Triggers

| Event | What runs |
| --- | --- |
| Pull request → `main` | Quality, security, unit tests, build, E2E |
| Push → `main` | Full pipeline + staging deploy + wiki report + failure tickets |
| Manual (`workflow_dispatch`) | Same as push to `main` |

## Stages

| # | Stage | Purpose |
| --- | --- | --- |
| 1 | Code Quality | ESLint, Prettier, TypeScript |
| 2 | Security Analysis | npm audit, TruffleHog, CodeQL, Trivy |
| 2.5 | Await Fix Decision | Early ticket when quality/security fails on `main` |
| 3 | Unit Tests | Vitest with coverage artifact |
| 4 | Build | Production `dist/`, SBOM, signed bundle, attestation |
| 5 | E2E Tests | Playwright on downloaded `build-artifact` (5 browsers) |
| 6 | Docker | Build & push image to GHCR (`:<sha>`, `:staging`) |
| 7 | Deploy Staging | SSH, `docker pull`, health + smoke tests |
| 8 | Failure Ticket | GitHub Issue when any required stage fails |
| 9 | Wiki Report | Per-run report (always on `main` push) |

## Key principles

- **Build once** — E2E and deploy consume the same `dist/` artifact.
- **Least privilege** — default `contents: read`; elevated only where needed.
- **No silent dependency changes** — CI never runs `npm audit fix`.
- **Pinned Actions** — workflow uses full commit SHAs.

See also: [Artifact Reference](Artifact-Reference) · [Troubleshooting](Troubleshooting) · [Pipeline Reports](Pipeline-Reports)
WIKIEOF
fi

if [ ! -f Artifact-Reference.md ]; then
  cat > Artifact-Reference.md <<'WIKIEOF'
# Artifact Reference

Artifacts are downloaded from the **Actions** tab on each workflow run.

| Artifact | Retention | Contents | Used by |
| --- | --- | --- | --- |
| `build-artifact` | 14 days | Production `dist/` | E2E job, Docker build |
| `app-dist-<sha>-bundle` | 30 days | Tarball + CycloneDX SBOM + SHA256SUMS | Release audit |
| Build attestation | — | GitHub provenance on tarball | Supply chain |
| `coverage-report` | 7 days | Vitest HTML/LCOV | Coverage review |
| `playwright-report` | 7 days | E2E HTML, traces, screenshots | Flaky test debug |
| GHCR image | Registry | `ghcr.io/<owner>/<repo>:<sha>` | Staging deploy |

## Downloading

1. Open the workflow run on GitHub Actions.
2. Scroll to **Artifacts** at the bottom of the summary.
3. Click the artifact name to download a ZIP.
WIKIEOF
fi

if [ ! -f Troubleshooting.md ]; then
  cat > Troubleshooting.md <<WIKIEOF
# Troubleshooting

Common pipeline failures. For run-specific details, see [[Pipeline-Reports]].

## Quick links

- [GitHub Actions](https://github.com/${GITHUB_REPOSITORY}/actions)
- [Open CI failure issues](https://github.com/${GITHUB_REPOSITORY}/issues?q=is%3Aissue+is%3Aopen+label%3Aci-failure)
- [CI-CD-PIPELINE.md](https://github.com/${GITHUB_REPOSITORY}/blob/main/docs/CI-CD-PIPELINE.md)

## Code quality

\`\`\`bash
npm ci && npm run lint:fix && npm run format && npx tsc --noEmit
\`\`\`

## Security

- Upgrade vulnerable packages in a PR (CI never runs \`npm audit fix\`).
- Rotate secrets if TruffleHog reports verified leaks.
- Review CodeQL and Trivy in the **Security** tab.

## Unit tests

\`\`\`bash
npm ci && npm run test:coverage
\`\`\`

## E2E

Download \`playwright-report\` from the failed run. Run locally:

\`\`\`bash
npm run build && npx vite preview --port 4173 &
npm run test:e2e
\`\`\`

## Deploy

| Symptom | Fix |
| --- | --- |
| SSH host key mismatch | Update \`STAGING_SSH_KNOWN_HOSTS\` |
| Docker permission denied | Add deploy user to \`docker\` group |
| GHCR pull failed | Set \`GHCR_PULL_TOKEN\` with \`read:packages\` |
| Health check timeout | Verify port **4173**; check container / PM2 |

Rollback uses \`/opt/enterprise-react-app/previous-image.txt\` on the staging host.
WIKIEOF
fi

stage_row() {
  local key="$1"
  local result="$2"
  local num="$3"
  printf '| %s | %s | %s | %s |\n' \
    "$num" \
    "$(stage_display_name "$key")" \
    "$(status_icon "$result")" \
    "$(format_job_link "$key")"
}

STAGE_TABLE=""
STAGE_TABLE+="| # | Stage | Result | Job |"
STAGE_TABLE+=$'\n'"| --- | --- | --- | --- |"
STAGE_TABLE+=$'\n'"$(stage_row code-quality "$CODE_QUALITY" 1)"
STAGE_TABLE+=$'\n'"$(stage_row security-scan "$SECURITY_SCAN" 2)"
STAGE_TABLE+=$'\n'"| 2.5 | $(stage_display_name await-fix-decision) | $(status_icon "$AWAIT_FIX_DECISION") | $(format_job_link await-fix-decision) |"
STAGE_TABLE+=$'\n'"$(stage_row unit-tests "$UNIT_TESTS" 3)"
STAGE_TABLE+=$'\n'"$(stage_row build "$BUILD" 4)"
STAGE_TABLE+=$'\n'"$(stage_row e2e-tests "$E2E_TESTS" 5)"
STAGE_TABLE+=$'\n'"$(stage_row docker-build-push "$DOCKER_BUILD_PUSH" 6)"
STAGE_TABLE+=$'\n'"$(stage_row deploy-staging "$DEPLOY_STAGING" 7)"
STAGE_TABLE+=$'\n'"| 8 | Failure ticket job | $(status_icon "$FAILURE_TICKET") | $(format_job_link failure-ticket) |"

FAILURE_ANALYSIS=""
if [ "$OVERALL" = "failure" ]; then
  FAILURE_ANALYSIS="### Failure analysis"$'\n\n'"Failed stages with remediation guidance:"$'\n\n'
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
    if [ "$result_var" = "failure" ]; then
      FAILURE_ANALYSIS+="$(stage_troubleshooting_md "$key")"$'\n\n'
    fi
  done
  OPEN_ISSUES="$(list_open_ci_issues "$GITHUB_REPOSITORY")"
  if [ -n "$OPEN_ISSUES" ]; then
    FAILURE_ANALYSIS+="### Open CI failure issues"$'\n\n'"${OPEN_ISSUES}"$'\n'
  fi
fi

if [ "$OVERALL" = "success" ]; then
  SUMMARY_TEXT="All required stages completed successfully."
elif [ "$OVERALL" = "failure" ]; then
  SUMMARY_TEXT="One or more stages **failed**. See failure analysis, job logs, and Issues labeled \`ci-failure\`."
else
  SUMMARY_TEXT="The pipeline did not finish cleanly (cancelled or incomplete)."
fi

cat > "${REPORT_PAGE}.md" <<EOF
# Pipeline Report — ${DATE_STAMP}

**Run [#${RUN_ID}](${RUN_URL})** · $(status_icon "$OVERALL")

---

## Run metadata

| Field | Value |
| --- | --- |
| Workflow | ${WORKFLOW_NAME} |
| Overall status | $(status_icon "$OVERALL") |
| Branch | \`${REF_NAME}\` |
| Commit | [\`${SHORT_SHA}\`](https://github.com/${GITHUB_REPOSITORY}/commit/${SHA}) |
| Commit message | ${COMMIT_MESSAGE:-_(not available)_} |
| Actor | @${ACTOR} |
| Event | \`${EVENT_NAME}\` |
| Report generated | ${TIMESTAMP} |
| Actions run | [Open run #${RUN_ID}](${RUN_URL}) |
${RUN_META}

---

## Stage results

${STAGE_TABLE}

---

## Summary

${SUMMARY_TEXT}

${FAILURE_ANALYSIS}

---

## Artifacts

[Download from this run](${RUN_URL}#artifacts):

| Artifact | Description |
| --- | --- |
| \`build-artifact\` | Production \`dist/\` (E2E + Docker) |
| \`app-dist-${SHORT_SHA}-bundle\` | Tarball + SBOM + SHA256SUMS |
| GHCR image | \`ghcr.io/${GITHUB_REPOSITORY}:${SHA}\` |
| \`coverage-report\` | Unit test coverage |
| \`playwright-report\` | E2E report and traces |

---

## Related

- [Pipeline Reports](Pipeline-Reports) · [Overview](Pipeline-Overview) · [Troubleshooting](Troubleshooting)
- [Actions](https://github.com/${GITHUB_REPOSITORY}/actions) · [CI issues](https://github.com/${GITHUB_REPOSITORY}/issues?q=label%3Aci-failure)

---
_Auto-generated by publish-wiki-report.sh_
EOF

INDEX="Pipeline-Reports.md"
HEADER='| Date (UTC) | Run | Status | Commit | Report |
| --- | --- | --- | --- | --- |'

NEW_ROW="| ${DATE_STAMP} | [#${RUN_ID}](${RUN_URL}) | $(status_badge "$OVERALL") | \`${SHORT_SHA}\` | [[${REPORT_PAGE}]] |"

if [ -f "$INDEX" ]; then
  EXISTING_ROWS=$(awk '/^\| [0-9]{4}-[0-9]{2}-[0-9]{2} / {print}' "$INDEX" | head -n 49)
  {
    echo "# Pipeline Reports"
    echo ""
    echo "Detailed reports after each \`main\` pipeline run (newest first)."
    echo ""
    echo "$HEADER"
    echo "$NEW_ROW"
    [ -n "$EXISTING_ROWS" ] && echo "$EXISTING_ROWS"
  } > "$INDEX"
else
  {
    echo "# Pipeline Reports"
    echo ""
    echo "$HEADER"
    echo "$NEW_ROW"
  } > "$INDEX"
fi

cat > Home.md <<EOF
# CI/CD Wiki

## Reports

- **[Pipeline Reports](Pipeline-Reports)** — all \`main\` runs
- **Latest:** [[${REPORT_PAGE}]] ($(status_icon "$OVERALL"))

## Reference

| Page | Description |
| --- | --- |
| [Pipeline Overview](Pipeline-Overview) | Stages and triggers |
| [Artifact Reference](Artifact-Reference) | Downloadable artifacts |
| [Troubleshooting](Troubleshooting) | Common fixes |

## Links

- [Actions](https://github.com/${GITHUB_REPOSITORY}/actions)
- [CI failure issues](https://github.com/${GITHUB_REPOSITORY}/issues?q=is%3Aissue+is%3Aopen+label%3Aci-failure)
- [CI-CD-PIPELINE.md](https://github.com/${GITHUB_REPOSITORY}/blob/main/docs/CI-CD-PIPELINE.md)

---
_Updated ${TIMESTAMP} · Run [#${RUN_ID}](${RUN_URL})_
EOF

git add Home.md Pipeline-Reports.md "${REPORT_PAGE}.md"
[ -f Pipeline-Overview.md ] && git add Pipeline-Overview.md
[ -f Artifact-Reference.md ] && git add Artifact-Reference.md
[ -f Troubleshooting.md ] && git add Troubleshooting.md

if git diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git commit -m "docs(wiki): pipeline report run ${RUN_ID} (${OVERALL})"
git push origin HEAD:master || git push origin HEAD:main

echo "Published wiki report: ${REPORT_PAGE}"
