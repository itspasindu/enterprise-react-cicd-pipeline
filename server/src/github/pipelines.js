/** Stage keys aligned with scripts/lib/ci-report-lib.sh */
import { GithubApiError } from './client.js'
import {
  extractZipEntry,
  parseReleaseIdentityFromArtifactName,
  parseReleaseIdentityFromJson,
} from './zip.js'
import { mapIssueComment, parseFailureReport } from './failure-report.js'

const DEPLOY_TIMELINE_STEPS = [
  { key: 'verify', label: 'Verify bundle', match: /verify.*bundle|immutable release/i },
  { key: 'pull', label: 'Pull digests', match: /pull.*digest|immutable release digest/i },
  { key: 'transfer', label: 'Transfer images', match: /transfer/i },
  { key: 'rollout', label: 'Compose rollout', match: /deploy compose|compose stack/i },
  { key: 'smoke', label: 'External smoke', match: /smoke|external smoke/i },
]

const RELEASE_ARTIFACT_NAMES = new Set(['release-bundle', 'cd-release'])

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
    jobNames: ['Deploy Staging', 'Deploy Full Stack to Staging', 'Prepare Release'],
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

export function mapArtifact(artifact, runId, { owner, repo } = {}) {
  const mappedRunId = runId ?? artifact.workflow_run?.id ?? null
  const githubUrl =
    owner && repo && mappedRunId
      ? `https://github.com/${owner}/${repo}/actions/runs/${mappedRunId}`
      : null
  return {
    id: artifact.id,
    name: artifact.name,
    sizeInBytes: artifact.size_in_bytes,
    expired: Boolean(artifact.expired),
    createdAt: artifact.created_at,
    expiresAt: artifact.expires_at,
    downloadUrl: artifact.archive_download_url,
    githubUrl,
    runId: mappedRunId,
  }
}

export function mapJobSteps(steps = []) {
  return steps.map(step => ({
    name: step.name,
    number: step.number,
    status: step.status,
    conclusion: normalizeConclusion(step.status, step.conclusion),
    startedAt: step.started_at,
    completedAt: step.completed_at,
  }))
}

export function buildDeployTimeline(jobs = []) {
  const deployJob =
    jobs.find(job => /deploy/i.test(job.name || '') && !/ticket|failure/i.test(job.name || '')) ||
    null
  if (!deployJob) return []

  const steps = deployJob.steps || []
  const timeline = []

  for (const def of DEPLOY_TIMELINE_STEPS) {
    const step = steps.find(item => def.match.test(item.name || ''))
    if (!step) continue
    const conclusion = normalizeConclusion(step.status, step.conclusion)
    const startedAt = step.started_at || step.startedAt || null
    const completedAt = step.completed_at || step.completedAt || null
    let durationMs = null
    if (startedAt) {
      const start = new Date(startedAt).getTime()
      const end = completedAt ? new Date(completedAt).getTime() : Date.now()
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        durationMs = Math.max(0, end - start)
      }
    }
    timeline.push({
      key: def.key,
      label: def.label,
      name: step.name,
      status: step.status,
      conclusion,
      startedAt,
      completedAt,
      durationMs,
      jobHtmlUrl: deployJob.html_url || deployJob.htmlUrl || null,
    })
  }

  return timeline
}

function createdFilterForSince(since) {
  if (!since) return undefined
  const date = new Date(since)
  if (Number.isNaN(date.getTime())) return undefined
  return `>=${date.toISOString().slice(0, 10)}`
}

export function mapIssue(issue) {
  const body = issue.body || null
  const report = parseFailureReport(body)
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
    body,
    report,
  }
}

export function createPipelineService({ github, cache, stagingUrl, probeFn }) {
  const probe = probeFn || defaultProbe
  const repoMeta = github ? { owner: github.owner, repo: github.repo } : {}

  async function cached(key, fn, ttlMs) {
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const value = await fn()
    return cache.set(key, value, ttlMs)
  }

  async function getGithubHealth() {
    if (!github) {
      return {
        configured: false,
        reachable: false,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        error: 'GitHub is not configured',
      }
    }

    return cached(
      'github-health',
      async () => {
        const started = Date.now()
        try {
          await github.get('/rate_limit')
          return {
            configured: true,
            reachable: true,
            latencyMs: Date.now() - started,
            checkedAt: new Date().toISOString(),
            error: null,
          }
        } catch (error) {
          return {
            configured: true,
            reachable: false,
            latencyMs: Date.now() - started,
            checkedAt: new Date().toISOString(),
            error: error.message || 'GitHub unreachable',
          }
        }
      },
      15_000
    )
  }

  async function listRuns({
    workflow,
    perPage = 15,
    page = 1,
    branch,
    actor,
    status,
    since,
  } = {}) {
    const created = createdFilterForSince(since)
    const cacheKey = `runs:${workflow || 'all'}:${perPage}:${page}:${branch || ''}:${actor || ''}:${status || ''}:${created || ''}`
    return cached(cacheKey, async () => {
      const workflows = workflow ? [workflow] : ['ci.yml', 'cd.yml']
      const batches = await Promise.all(
        workflows.map(file =>
          github
            .listWorkflowRuns({
              workflow: file,
              perPage,
              page,
              branch,
              actor,
              status,
              created,
            })
            .catch(error => {
              if (error.status === 404) return { workflow_runs: [] }
              throw error
            })
        )
      )
      let runs = batches
        .flatMap(batch => batch.workflow_runs || [])
        .map(mapWorkflowRun)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      // GitHub "status" overlaps conclusion values (success/failure); keep client filter as safety net.
      if (status && !['completed', 'in_progress', 'queued', 'waiting', 'requested', 'pending'].includes(status)) {
        runs = runs.filter(run => (run.conclusion || '').toLowerCase() === status.toLowerCase())
      }
      if (since) {
        const sinceMs = new Date(since).getTime()
        if (!Number.isNaN(sinceMs)) {
          runs = runs.filter(run => new Date(run.createdAt).getTime() >= sinceMs)
        }
      }

      return { runs, page, perPage, filters: { branch, actor, status, since } }
    })
  }

  async function resolveReleaseIdentity(runId) {
    if (!runId) return null
    return cached(`release-identity:${runId}`, async () => {
      try {
        const payload = await github.listArtifactsForRun(runId)
        const artifacts = payload.artifacts || []
        const preferred =
          artifacts.find(a => RELEASE_ARTIFACT_NAMES.has(a.name) && !a.expired) ||
          artifacts.find(a => /^release-\d{4}\.\d{1,2}\.\d+-/i.test(a.name) && !a.expired) ||
          null

        let identity = preferred ? parseReleaseIdentityFromArtifactName(preferred.name) : null

        if (preferred && !preferred.expired) {
          try {
            const zip = await github.downloadArtifactZip(preferred.id)
            const file =
              extractZipEntry(zip, 'release.json') || extractZipEntry(zip, 'release-metadata.json')
            if (file) {
              const fromJson = parseReleaseIdentityFromJson(file)
              if (fromJson) {
                identity = {
                  ...fromJson,
                  sourceArtifact: preferred.name,
                  sourceRunId: Number(runId),
                }
              }
            }
          } catch {
            // Fall back to name parse / null — do not fail the board
          }
        }

        if (identity) {
          return {
            ...identity,
            sourceArtifact: preferred?.name || identity.sourceArtifact || null,
            sourceRunId: Number(runId),
          }
        }
        return null
      } catch {
        return null
      }
    }, 60_000)
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
      const deployTimeline = buildDeployTimeline(jobs)
      let release = null
      if (mapped.workflow === 'cd' || mapped.workflow === 'ci') {
        release = await resolveReleaseIdentity(runId)
      }
      return {
        ...mapped,
        stages: summarizeJobsIntoStages(jobs),
        deployTimeline,
        release,
        jobs: jobs.map(job => ({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: normalizeConclusion(job.status, job.conclusion),
          startedAt: job.started_at,
          completedAt: job.completed_at,
          htmlUrl: job.html_url,
          stageKey: mapJobToStageKey(job.name),
          steps: mapJobSteps(job.steps || []),
        })),
        artifacts: (artifactsPayload.artifacts || []).map(a =>
          mapArtifact(a, Number(runId), repoMeta)
        ),
      }
    })
  }

  async function listArtifactsForRun(runId) {
    const payload = await github.listArtifactsForRun(runId)
    return {
      runId: Number(runId),
      artifacts: (payload.artifacts || []).map(a => mapArtifact(a, Number(runId), repoMeta)),
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

  async function getFailureDetail(issueNumber) {
    const cacheKey = `failure:${issueNumber}`
    return cached(cacheKey, async () => {
      const [issue, commentsPayload] = await Promise.all([
        github.getIssue(issueNumber),
        github.listIssueComments(issueNumber).catch(() => []),
      ])
      if (issue.pull_request) {
        throw new GithubApiError('Not a failure issue', { status: 404 })
      }
      const labels = (issue.labels || []).map(label =>
        typeof label === 'string' ? label : label.name
      )
      if (!labels.includes('ci-failure')) {
        throw new GithubApiError('Not a CI failure ticket', { status: 404 })
      }
      const mapped = mapIssue(issue)
      const comments = (Array.isArray(commentsPayload) ? commentsPayload : []).map(mapIssueComment)
      return { ...mapped, comments }
    }, 30_000)
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
      // Degrade instead of failing the whole board when one GitHub call fails
      // (missing issues:read, transient egress, rate limit, etc.).
      const [runsResult, failuresResult, stagingResult, githubResult] = await Promise.allSettled([
        listRuns({ perPage: 10, page: 1 }),
        listFailures({ perPage: 10, page: 1 }).catch(error => {
          if (error instanceof GithubApiError && (error.status === 403 || error.status === 404)) {
            return { failures: [], page: 1, perPage: 10, count: 0 }
          }
          throw error
        }),
        getStagingHealth(),
        getGithubHealth(),
      ])

      if (runsResult.status === 'rejected') {
        throw runsResult.reason
      }

      const runs = runsResult.value.runs
      const failures =
        failuresResult.status === 'fulfilled'
          ? failuresResult.value
          : { failures: [], page: 1, perPage: 10, count: 0 }
      const staging =
        stagingResult.status === 'fulfilled'
          ? stagingResult.value
          : {
              baseUrl: stagingUrl,
              healthy: false,
              ready: false,
              checks: [],
              checkedAt: new Date().toISOString(),
            }
      const githubHealth =
        githubResult.status === 'fulfilled'
          ? githubResult.value
          : {
              configured: Boolean(github),
              reachable: false,
              latencyMs: null,
              checkedAt: new Date().toISOString(),
              error: githubResult.reason?.message || 'GitHub health check failed',
            }

      const latestCi = runs.find(run => run.workflow === 'ci') || null
      const latestCd = runs.find(run => run.workflow === 'cd') || null

      let stages = STAGE_DEFINITIONS.map(def => ({
        key: def.key,
        name: def.name,
        status: 'skipped',
        conclusion: 'skipped',
        jobs: [],
      }))
      let deployTimeline = []
      let release = null

      const detailSource = latestCd || latestCi
      if (detailSource) {
        try {
          const detail = await getRunDetail(detailSource.id)
          stages = detail.stages
          deployTimeline = detail.deployTimeline || []
          release = detail.release
        } catch {
          // Keep empty stage board if detail fetch fails
        }
      }

      if (!release && latestCi && latestCi.id !== detailSource?.id) {
        try {
          release = await resolveReleaseIdentity(latestCi.id)
        } catch {
          // ignore
        }
      }

      return {
        latestCi,
        latestCd,
        stages,
        deployTimeline,
        release,
        github: githubHealth,
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
    getFailureDetail,
    getStagingHealth,
    getGithubHealth,
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

