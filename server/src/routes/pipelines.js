import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { GithubApiError } from '../github/client.js'
import { isGithubConfigured } from '../config.js'

const SETUP_HINT =
  'Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO on the API to enable live pipeline data.'

export function createPipelinesRouter({ config, pipelineService }) {
  const router = Router()
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })

  router.use(limiter)

  router.get('/status', (_request, response) => {
    const configured = isGithubConfigured(config)
    response.json({
      configured,
      owner: configured ? config.githubOwner : null,
      repo: configured ? config.githubRepo : null,
      stagingUrl: config.stagingUrl,
      live: configured,
      hint: configured ? null : SETUP_HINT,
    })
  })

  function requireGithub(_request, response, next) {
    if (!isGithubConfigured(config)) {
      return response.status(503).json({
        error: 'Pipeline monitor is not configured',
        hint: SETUP_HINT,
      })
    }
    return next()
  }

  router.get('/overview', requireGithub, async (_request, response, next) => {
    try {
      response.json(await pipelineService.getOverview())
    } catch (error) {
      next(error)
    }
  })

  router.get('/runs', requireGithub, async (request, response, next) => {
    try {
      const workflow = request.query.workflow
      const page = Number(request.query.page) || 1
      const perPage = Math.min(Number(request.query.perPage) || 15, 50)
      const result = await pipelineService.listRuns({
        workflow: workflow === 'ci' ? 'ci.yml' : workflow === 'cd' ? 'cd.yml' : undefined,
        page,
        perPage,
      })
      if (workflow === 'ci' || workflow === 'cd') {
        result.runs = result.runs.filter(run => run.workflow === workflow)
      }
      response.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/runs/:runId', requireGithub, async (request, response, next) => {
    try {
      response.json(await pipelineService.getRunDetail(request.params.runId))
    } catch (error) {
      next(error)
    }
  })

  router.get('/runs/:runId/artifacts', requireGithub, async (request, response, next) => {
    try {
      response.json(await pipelineService.listArtifactsForRun(request.params.runId))
    } catch (error) {
      next(error)
    }
  })

  router.get('/failures', requireGithub, async (request, response, next) => {
    try {
      const page = Number(request.query.page) || 1
      const perPage = Math.min(Number(request.query.perPage) || 30, 50)
      response.json(await pipelineService.listFailures({ page, perPage }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/staging', async (_request, response, next) => {
    try {
      response.json(await pipelineService.getStagingHealth())
    } catch (error) {
      next(error)
    }
  })

  router.use((error, _request, response, next) => {
    if (error instanceof GithubApiError) {
      const status = error.status === 401 || error.status === 403 ? 502 : Math.min(error.status || 502, 502)
      return response.status(status).json({
        error: 'GitHub API request failed',
        message: error.message,
        hint:
          error.status === 401 || error.status === 403
            ? 'Check GITHUB_TOKEN scopes and expiry.'
            : undefined,
      })
    }
    return next(error)
  })

  return router
}
