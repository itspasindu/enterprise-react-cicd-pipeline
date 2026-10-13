/**
 * Parse automated CI failure ticket bodies from scripts/create-failure-ticket.sh
 * into structured fields for the Pipeline Monitor UI.
 */

function emptyToNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text || text === '—' || text === 'n/a') return null
  return text
}

function extractSection(body, heading) {
  if (!body) return null
  const pattern = new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|\\n##\\s+|$)`, 'i')
  const match = body.match(pattern)
  return match ? match[1].trim() : null
}

function parseMarkdownTable(section) {
  if (!section) return []
  const lines = section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|'))
  if (lines.length < 2) return []

  const rows = []
  for (const line of lines) {
    if (/^\|\s*-+/.test(line)) continue
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())
    if (cells.length >= 2) rows.push(cells)
  }
  return rows
}

function stripMarkdownLink(cell) {
  if (!cell) return { text: null, url: null }
  const match = cell.match(/\[([^\]]+)\]\(([^)]+)\)/)
  if (match) {
    return { text: match[1], url: match[2] }
  }
  const cleaned = cell
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/❌\s*/g, '')
    .trim()
  return { text: emptyToNull(cleaned), url: null }
}

function parseSummaryTable(section) {
  const rows = parseMarkdownTable(section)
  const summary = {}
  for (const cells of rows) {
    if (cells[0]?.toLowerCase().includes('field')) continue
    const key = stripMarkdownLink(cells[0]).text?.toLowerCase() || ''
    const value = stripMarkdownLink(cells[1])
    if (key.includes('overall')) summary.overall = value.text
    else if (key.includes('workflow')) {
      summary.runLabel = value.text
      summary.runUrl = value.url
    } else if (key.includes('commit')) {
      summary.commitLabel = value.text
      summary.commitUrl = value.url
    } else if (key.includes('message')) summary.commitMessage = value.text
    else if (key.includes('branch')) summary.branch = value.text
    else if (key.includes('pull request')) {
      summary.prLabel = value.text
      summary.prUrl = value.url
    } else if (key.includes('triggered')) summary.triggeredBy = value.text
    else if (key.includes('artifact')) {
      summary.artifactsLabel = value.text
      summary.artifactsUrl = value.url
    }
  }
  return summary
}

function parseStageResults(section) {
  const rows = parseMarkdownTable(section)
  const stages = []
  for (const cells of rows) {
    if ((cells[0] || '').toLowerCase() === 'stage') continue
    const logs = stripMarkdownLink(cells[2] || '')
    stages.push({
      name: stripMarkdownLink(cells[0]).text,
      status: stripMarkdownLink(cells[1]).text,
      logsLabel: logs.text,
      logsUrl: logs.url,
    })
  }
  return stages.filter(stage => stage.name)
}

function parseChecklist(section) {
  if (!section) return []
  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^- \[[ xX]\]/.test(line))
    .map(line => {
      const done = /^- \[[xX]\]/.test(line)
      const text = line.replace(/^- \[[ xX]\]\s*/, '').replace(/\*\*/g, '').trim()
      return { done, text }
    })
}

function parseReproduceBlock(section) {
  if (!section) return null
  const match = section.match(/```(?:bash)?\n([\s\S]*?)```/)
  return match ? match[1].trim() : section.trim()
}

export function parseFailureReport(body) {
  if (!body || typeof body !== 'string') {
    return {
      hasStructuredReport: false,
      summary: {},
      checklist: [],
      stages: [],
      investigation: null,
      reproduce: null,
      fixPath: null,
      rawBody: body || null,
    }
  }

  const hasStructuredReport = /##\s+Pipeline failure report/i.test(body)
  const summarySection = extractSection(body, 'Summary')
  const checklistSection = extractSection(body, 'Failed stages \\(resolution checklist\\)')
  const stagesSection = extractSection(body, 'All stage results')
  const investigationSection = extractSection(body, 'Investigation guide')
  const reproduceSection =
    extractSection(body, 'Reproduce locally[^\n]*') ||
    body.match(/###\s+Reproduce locally[\s\S]*?```(?:bash)?\n([\s\S]*?)```/)?.[0] ||
    null
  const fixPathSection =
    extractSection(body, 'Developer fix path[^\n]*') ||
    extractSection(body, 'How to fix \\(pull request\\)')

  return {
    hasStructuredReport,
    summary: parseSummaryTable(summarySection),
    checklist: parseChecklist(checklistSection),
    stages: parseStageResults(stagesSection),
    investigation: emptyToNull(investigationSection),
    reproduce: parseReproduceBlock(reproduceSection),
    fixPath: emptyToNull(fixPathSection),
    rawBody: body,
  }
}

export function mapIssueComment(comment) {
  return {
    id: comment.id,
    body: comment.body || '',
    author: comment.user?.login || null,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    htmlUrl: comment.html_url,
  }
}
