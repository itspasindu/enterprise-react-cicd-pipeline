#!/usr/bin/env bash
# Publish a final CI/CD pipeline report to the repository GitHub Wiki.
set -euo pipefail

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

CODE_QUALITY="${CODE_QUALITY:-unknown}"
SECURITY_SCAN="${SECURITY_SCAN:-unknown}"
AWAIT_FIX_DECISION="${AWAIT_FIX_DECISION:-skipped}"
UNIT_TESTS="${UNIT_TESTS:-unknown}"
BUILD="${BUILD:-unknown}"
E2E_TESTS="${E2E_TESTS:-unknown}"
DEPLOY_STAGING="${DEPLOY_STAGING:-unknown}"
FAILURE_TICKET="${FAILURE_TICKET:-skipped}"

status_icon() {
  case "$1" in
    success) echo "✅ success" ;;
    failure) echo "❌ failure" ;;
    cancelled) echo "⛔ cancelled" ;;
    skipped) echo "⏭️ skipped" ;;
    *) echo "❔ $1" ;;
  esac
}

OVERALL="success"
for result in "$CODE_QUALITY" "$SECURITY_SCAN" "$UNIT_TESTS" "$BUILD" "$E2E_TESTS" "$DEPLOY_STAGING"; do
  if [ "$result" = "failure" ]; then
    OVERALL="failure"
    break
  fi
done

if [ "$OVERALL" != "failure" ]; then
  for result in "$CODE_QUALITY" "$SECURITY_SCAN" "$UNIT_TESTS" "$BUILD" "$E2E_TESTS" "$DEPLOY_STAGING"; do
    if [ "$result" = "cancelled" ]; then
      OVERALL="cancelled"
      break
    fi
  done
fi

TIMESTAMP="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
DATE_STAMP="$(date -u +"%Y-%m-%d")"
SHORT_SHA="${SHA:0:7}"
REPORT_PAGE="Pipeline-Report-${DATE_STAMP}-run-${RUN_ID}"
WIKI_DIR="$(mktemp -d)"
WIKI_URL="https://x-access-token:${TOKEN}@github.com/${GITHUB_REPOSITORY}.wiki.git"

cleanup() {
  rm -rf "$WIKI_DIR"
}
trap cleanup EXIT

echo "Cloning wiki repository..."
if ! git clone --depth=1 "$WIKI_URL" "$WIKI_DIR" 2>/tmp/wiki-clone-err; then
  cat /tmp/wiki-clone-err || true
  echo ""
  echo "ERROR: Unable to clone the wiki."
  echo "Ensure the repository Wiki is enabled (Settings → General → Features → Wikis),"
  echo "create at least one wiki page once, and set secret WIKI_TOKEN with repo/wiki write access."
  echo "GITHUB_TOKEN alone often cannot push to the wiki."
  exit 1
fi

cd "$WIKI_DIR"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Individual run report
cat > "${REPORT_PAGE}.md" <<EOF
# Pipeline Report — ${DATE_STAMP} (run ${RUN_ID})

| Field | Value |
| --- | --- |
| Workflow | ${WORKFLOW_NAME} |
| Overall status | $(status_icon "$OVERALL") |
| Branch | \`main\` |
| Commit | [\`${SHORT_SHA}\`](https://github.com/${GITHUB_REPOSITORY}/commit/${SHA}) |
| Actor | @${ACTOR} |
| Event | \`${EVENT_NAME}\` |
| Completed | ${TIMESTAMP} |
| Actions run | [Open run #${RUN_ID}](${RUN_URL}) |

## Stage results

| Stage | Result |
| --- | --- |
| 1. Code Quality Checks | $(status_icon "$CODE_QUALITY") |
| 2. Security Analysis | $(status_icon "$SECURITY_SCAN") |
| 2.5 Await Fix Decision | $(status_icon "$AWAIT_FIX_DECISION") |
| 3. Unit Tests | $(status_icon "$UNIT_TESTS") |
| 4. Build & Bundle Analysis | $(status_icon "$BUILD") |
| 5. E2E Tests | $(status_icon "$E2E_TESTS") |
| 6. Deploy to Staging | $(status_icon "$DEPLOY_STAGING") |
| 7. Failure Ticket | $(status_icon "$FAILURE_TICKET") |

## Summary

EOF

if [ "$OVERALL" = "success" ]; then
  cat >> "${REPORT_PAGE}.md" <<EOF
All required pipeline stages completed successfully. Staging deploy finished (or was skipped only when expected).

EOF
elif [ "$OVERALL" = "failure" ]; then
  cat >> "${REPORT_PAGE}.md" <<EOF
One or more stages **failed**. Check the [workflow run](${RUN_URL}) logs and any open Issues labeled \`ci-failure\`.

EOF
else
  cat >> "${REPORT_PAGE}.md" <<EOF
The pipeline did not finish cleanly (cancelled or incomplete stages). See the [workflow run](${RUN_URL}).

EOF
fi

cat >> "${REPORT_PAGE}.md" <<EOF
## Artifacts

When produced by the run, these are available from the Actions UI:

- \`build-artifact\` — exact production \`dist/\` (used by E2E + staging deploy)
- \`app-dist-<sha>-bundle\` — immutable tarball + CycloneDX SBOM + SHA256SUMS
- Build provenance attestation on \`app-dist-<sha>.tar.gz\`
- \`coverage-report\` — unit test coverage
- \`playwright-report\` — E2E HTML report

## Related links

- [Latest pipeline reports index](Pipeline-Reports)
- [GitHub Actions](https://github.com/${GITHUB_REPOSITORY}/actions)
- [Issues](https://github.com/${GITHUB_REPOSITORY}/issues)

---
_Generated automatically by the Enterprise CI/CD pipeline._
EOF

# Rolling index page (newest first, keep header + 50 rows)
INDEX="Pipeline-Reports.md"
HEADER=$(cat <<'EOF'
# Pipeline Reports

Final CI/CD reports published after each `main` pipeline run.

| Date (UTC) | Run | Status | Report |
| --- | --- | --- | --- |
EOF
)

NEW_ROW="| ${DATE_STAMP} | [#${RUN_ID}](${RUN_URL}) | $(status_icon "$OVERALL") | [[${REPORT_PAGE}]] |"

if [ -f "$INDEX" ] && grep -q '| Date (UTC) | Run | Status | Report |' "$INDEX"; then
  EXISTING_ROWS=$(awk '/^\| [0-9]{4}-[0-9]{2}-[0-9]{2} / {print}' "$INDEX" | head -n 49)
  {
    printf '%s\n' "$HEADER"
    printf '%s\n' "$NEW_ROW"
    if [ -n "$EXISTING_ROWS" ]; then
      printf '%s\n' "$EXISTING_ROWS"
    fi
  } > "$INDEX"
else
  {
    printf '%s\n' "$HEADER"
    printf '%s\n' "$NEW_ROW"
  } > "$INDEX"
fi

# Home page pointer
if [ ! -f Home.md ]; then
  cat > Home.md <<EOF
# Enterprise React CI/CD Wiki

Welcome to the project wiki.

- **[Pipeline Reports](Pipeline-Reports)** — final reports after each \`main\` pipeline run
- Latest report: [[${REPORT_PAGE}]]
EOF
else
  if grep -q "Latest pipeline report:" Home.md; then
    sed -i "s|Latest pipeline report:.*|Latest pipeline report: [[${REPORT_PAGE}]] ($(status_icon "$OVERALL"))|" Home.md
  elif grep -q "Latest report:" Home.md; then
    sed -i "s|Latest report:.*|Latest report: [[${REPORT_PAGE}]] ($(status_icon "$OVERALL"))|" Home.md
  else
    printf '\n## CI/CD\n\n- [Pipeline Reports](Pipeline-Reports)\n- Latest pipeline report: [[%s]] (%s)\n' \
      "$REPORT_PAGE" "$(status_icon "$OVERALL")" >> Home.md
  fi
fi

git add Home.md Pipeline-Reports.md "${REPORT_PAGE}.md"
if git diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git commit -m "docs(wiki): pipeline report for run ${RUN_ID} (${OVERALL})"
git push origin HEAD:master || git push origin HEAD:main

echo "Published wiki report page: ${REPORT_PAGE}"
echo "Wiki index updated: Pipeline-Reports"
