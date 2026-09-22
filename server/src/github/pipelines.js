/** Stage keys aligned with scripts/lib/ci-report-lib.sh */
export const STAGE_DEFINITIONS = [
  { key: 'full-stack-tests', name: 'Full-Stack Tests', jobNames: ['Test Full Stack'] },
  { key: 'security-scan', name: 'Security Analysis', jobNames: ['Security Full Stack'] },
  {
    key: 'container-release',
    name: 'Web & API Container Release',
    jobNames: ['Package Release'],
  },
  {
    key: 'compose-deploy',
    name: 'Compose Deployment',
    jobNames: ['Deploy Staging', 'Prepare Release'],
  },
  {
    key: 'rollback',
    name: 'Staging Rollback',
    jobNames: ['Roll Back Staging'],
  },
  {
    key: 'failure-ticket',
    name: 'Failure Ticket',
    jobNames: ['Create Failure Ticket', 'Create Deployment Failure Ticket'],
  },
]

const JOB_NAME_TO_STAGE = new Map()
for (const stage of STAGE_DEFINITIONS) {
  for (const jobName of stage.jobNames) {
    JOB_NAME_TO_STAGE.set(jobName.toLowerCase(), stage.key)
  }
}

export function stageDisplayName(key) {
  return STAGE_DEFINITIONS.find(stage => stage.key === key)?.name ?? key
}

export function mapJobToStageKey(jobName) {
  if (!jobName) return null
  const exact = JOB_NAME_TO_STAGE.get(jobName.toLowerCase())
  if (exact) return exact

  const lower = jobName.toLowerCase()
  if (lower.includes('test') && lower.includes('full')) return 'full-stack-tests'
  if (lower.includes('security')) return 'security-scan'
  if (lower.includes('package') || lower.includes('release')) return 'container-release'
  if (lower.includes('deploy')) return 'compose-deploy'
  if (lower.includes('roll back') || lower.includes('rollback')) return 'rollback'
  if (lower.includes('failure') && lower.includes('ticket')) return 'failure-ticket'
  return null
}

function normalizeConclusion(status, conclusion) {
  if (status === 'in_progress' || status === 'queued' || status === 'waiting' || status === 'requested') {
    return 'in_progress'
  }
  if (status === 'completed') {
    return conclusion || 'unknown'
  }
  return conclusion || status || 'unknown'
}

export function summarizeJobsIntoStages(jobs = []) {
  const byKey = new Map()

  for (const def of STAGE_DEFINITIONS) {
    byKey.set(def.key, {
      key: def.key,
      name: def.name,
      status: 'skipped',
      conclusion: 'skipped',
      jobs: [],
    })
  }

  for (const job of jobs) {
    const stageKey = mapJobToStageKey(job.name)
    if (!stageKey) continue
    const stage = byKey.get(stageKey)
    if (!stage) continue

    const conclusion = normalizeConclusion(job.status, job.conclusion)
    stage.jobs.push({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      htmlUrl: job.html_url,
    })
  }

  for (const stage of byKey.values()) {
    if (stage.jobs.length === 0) {
      stage.status = 'skipped'
      stage.conclusion = 'skipped'
      continue
    }

    const conclusions = stage.jobs.map(job => job.conclusion)
    if (conclusions.some(c => c === 'in_progress')) {
      stage.status = 'in_progress'
      stage.conclusion = 'in_progress'
    } else if (conclusions.some(c => c === 'failure' || c === 'timed_out' || c === 'startup_failure')) {
      stage.status = 'completed'
      stage.conclusion = 'failure'
    } else if (conclusions.every(c => c === 'skipped')) {
      stage.status = 'completed'
      stage.conclusion = 'skipped'
    } else if (conclusions.every(c => c === 'success' || c === 'skipped' || c === 'neutral')) {
      stage.status = 'completed'
      stage.conclusion = conclusions.some(c => c === 'success') ? 'success' : 'neutral'
    } else if (conclusions.some(c => c === 'cancelled')) {
      stage.status = 'completed'
      stage.conclusion = 'cancelled'
    } else {
      stage.status = 'completed'
      stage.conclusion = conclusions[0]
    }
  }

  return STAGE_DEFINITIONS.map(def => byKey.get(def.key))
}

export function mapWorkflowRun(run) {
  const workflowName = run.name || run.display_title || ''
  const path = run.path || ''
  let workflow = 'other'
  if (path.includes('ci.yml') || workflowName === 'CI') workflow = 'ci'
  else if (path.includes('cd.yml') || workflowName === 'CD') workflow = 'cd'

  return {
    id: run.id,
    name: run.name,
    displayTitle: run.display_title,
    workflow,
    workflowPath: path,
    status: run.status,
    conclusion: normalizeConclusion(run.status, run.conclusion),
    event: run.event,
    branch: run.head_branch,
    sha: run.head_sha,
    shortSha: run.head_sha?.slice(0, 7),
    actor: run.actor?.login || run.triggering_actor?.login || null,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    runStartedAt: run.run_started_at,
    runAttempt: run.run_attempt,
  }
}

export function mapArtifact(artifact, runId) {
  return {
    id: artifact.id,
    name: artifact.name,
    sizeInBytes: artifact.size_in_bytes,
    expired: Boolean(artifact.expired),
    createdAt: artifact.created_at,
    expiresAt: artifact.expires_at,
    downloadUrl: artifact.archive_download_url,
    runId: runId ?? artifact.workflow_run?.id ?? null,
  }
}

export function mapIssue(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    labels: (issue.labels || []).map(label => (typeof label === 'string' ? label : label.name)),
    author: issue.user?.login || null,
  }
}

export function createPipelineService({ github, cache, stagingUrl, probeFn }) {
  const probe = probeFn || defaultProbe

  async function cached(key, fn, ttlMs) {
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const value = await fn()
    return cache.set(key, value, ttlMs)
  }

  async function listRuns({ workflow, perPage = 15, page = 1 } = {}) {
    const cacheKey = `runs:${workflow || 'all'}:${perPage}:${page}`
    return cached(cacheKey, async () => {
      const workflows = workflow ? [workflow] : ['ci.yml', 'cd.yml']
      const batches = await Promise.all(
        workflows.map(file =>
          github.listWorkflowRuns({ workflow: file, perPage, page }).catch(error => {
            if (error.status === 404) return { workflow_runs: [] }
            throw error
          })
        )
      )
      const runs = batches
        .flatMap(batch => batch.workflow_runs || [])
        .map(mapWorkflowRun)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return { runs, page, perPage }
    })
  }

  async function getRunDetail(runId) {
    const cacheKey = `run:${runId}`
    return cached(cacheKey, async () => {
      const [run, jobsPayload, artifactsPayload] = await Promise.all([
        github.getWorkflowRun(runId),
        github.listJobsForRun(runId),
        github.listArtifactsForRun(runId).catch(() => ({ artifacts: [] })),
      ])
      const mapped = mapWorkflowRun(run)
      const jobs = jobsPayload.jobs || []
      return {
        ...mapped,
        stages: summarizeJobsIntoStages(jobs),
        jobs: jobs.map(job => ({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: normalizeConclusion(job.status, job.conclusion),
          startedAt: job.started_at,
          completedAt: job.completed_at,
          htmlUrl: job.html_url,
          stageKey: mapJobToStageKey(job.name),
        })),
        artifacts: (artifactsPayload.artifacts || []).map(a => mapArtifact(a, Number(runId))),
      }
    })
  }

  async function listArtifactsForRun(runId) {
    const payload = await github.listArtifactsForRun(runId)
    return {
      runId: Number(runId),
      artifacts: (payload.artifacts || []).map(a => mapArtifact(a, Number(runId))),
    }
  }

  async function listFailures({ perPage = 30, page = 1 } = {}) {
    const cacheKey = `failures:${perPage}:${page}`
    return cached(cacheKey, async () => {
      const issues = await github.listIssues({
        labels: 'ci-failure',
        state: 'open',
        perPage,
        page,
      })
      // GitHub returns PRs in /issues; filter to issues only
      const failures = (Array.isArray(issues) ? issues : [])
        .filter(issue => !issue.pull_request)
        .map(mapIssue)
      return { failures, page, perPage, count: failures.length }
    })
  }

  async function getStagingHealth() {
    const paths = ['/api/health', '/api/ready', '/', '/about', '/contact']
    const checks = await Promise.all(
      paths.map(async path => {
        const url = `${stagingUrl}${path}`
        const started = Date.now()
        try {
          const result = await probe(url)
          return {
            path,
            url,
            ok: result.ok,
            status: result.status,
            latencyMs: Date.now() - started,
            error: null,
          }
        } catch (error) {
          return {
            path,
            url,
            ok: false,
            status: 0,
            latencyMs: Date.now() - started,
            error: error.message || 'Probe failed',
          }
        }
      })
    )
    const ready = checks.find(c => c.path === '/api/ready')
    return {
      baseUrl: stagingUrl,
      healthy: checks.every(c => c.ok),
      ready: Boolean(ready?.ok),
      checks,
      checkedAt: new Date().toISOString(),
    }
  }

  async function getOverview() {
    return cached('overview', async () => {
      const [{ runs }, failures, staging] = await Promise.all([
        listRuns({ perPage: 10, page: 1 }),
        listFailures({ perPage: 10, page: 1 }),
        getStagingHealth(),
      ])

      const latestCi = runs.find(run => run.workflow === 'ci') || null
      const latestCd = runs.find(run => run.workflow === 'cd') || null

      let stages = STAGE_DEFINITIONS.map(def => ({
        key: def.key,
        name: def.name,
        status: 'skipped',
        conclusion: 'skipped',
        jobs: [],
      }))

      const detailSource = latestCd || latestCi
      if (detailSource) {
        try {
          const detail = await getRunDetail(detailSource.id)
          stages = detail.stages
        } catch {
          // Keep empty stage board if detail fetch fails
        }
      }

      return {
        latestCi,
        latestCd,
        stages,
        openFailureCount: failures.count,
        recentFailures: failures.failures.slice(0, 5),
        staging: {
          healthy: staging.healthy,
          ready: staging.ready,
          baseUrl: staging.baseUrl,
        },
        recentRuns: runs.slice(0, 8),
        generatedAt: new Date().toISOString(),
      }
    }, 30_000)
  }

  return {
    listRuns,
    getRunDetail,
    listArtifactsForRun,
    listFailures,
    getStagingHealth,
    getOverview,
  }
}

async function defaultProbe(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'application/json, text/html, */*' },
    })
    return { ok: response.ok, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

