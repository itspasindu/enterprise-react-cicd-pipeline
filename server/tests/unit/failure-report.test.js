import { describe, expect, it } from 'vitest'
import { parseFailureReport } from '../../src/github/failure-report.js'

const SAMPLE_BODY = `## Pipeline failure report

> Automated ticket from **CI**.

### Summary

| Field | Value |
| --- | --- |
| **Overall** | ❌ Failed (Full-Stack Tests) |
| **Workflow run** | [#123](https://github.com/acme/platform/actions/runs/123) |
| **Commit** | [abcdef1](https://github.com/acme/platform/commit/abcdef1) |
| **Message** | fix: broken tests |
| **Branch** | \`main\` |
| **Triggered by** | @alice (\`push\`) |
| **Artifacts** | [Download from run](https://github.com/acme/platform/actions/runs/123#artifacts) |

---

### Failed stages (resolution checklist)

- [ ] **Full-Stack Tests** — investigate and resolve

---

### All stage results

| Stage | Status | Logs |
| --- | --- | --- |
| Full-Stack Tests | \`failure\` | [View logs](https://github.com/acme/platform/actions/runs/123/job/9) |
| Security Analysis | \`success\` | — |

---

### Investigation guide

Check the failed job logs.

---

### Reproduce locally (primary failure: Full-Stack Tests)

\`\`\`bash
git checkout abcdef1
npm test
\`\`\`

---

### Developer fix path (approval required)

Add \`fix/auto\` or \`fix/manual\`.
`

describe('parseFailureReport', () => {
  it('extracts structured fields from automated tickets', () => {
    const report = parseFailureReport(SAMPLE_BODY)
    expect(report.hasStructuredReport).toBe(true)
    expect(report.summary.overall).toContain('Failed')
    expect(report.summary.runUrl).toContain('/actions/runs/123')
    expect(report.summary.branch).toBe('main')
    expect(report.checklist).toEqual([
      { done: false, text: 'Full-Stack Tests — investigate and resolve' },
    ])
    expect(report.stages[0]).toMatchObject({
      name: 'Full-Stack Tests',
      status: 'failure',
      logsUrl: 'https://github.com/acme/platform/actions/runs/123/job/9',
    })
    expect(report.reproduce).toContain('npm test')
    expect(report.investigation).toContain('failed job logs')
  })

  it('handles missing bodies safely', () => {
    expect(parseFailureReport(null).hasStructuredReport).toBe(false)
    expect(parseFailureReport('plain text').hasStructuredReport).toBe(false)
    expect(parseFailureReport('plain text').rawBody).toBe('plain text')
  })
})
