import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { createPipelinesRouter } from './routes/pipelines.js'
import { createGithubClient, GithubApiError } from './github/client.js'
import { createPipelineService } from './github/pipelines.js'
import { createTtlCache } from './github/cache.js'
import { isGithubConfigured } from './config.js'

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  message: z.string().trim().min(5).max(5_000),
})

export function createApp({ pool, config = {} }) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '32kb' }))

  const stagingUrl = config.stagingUrl || 'http://localhost:4173'
  const github = isGithubConfigured(config)
    ? createGithubClient({
        token: config.githubToken,
        owner: config.githubOwner,
        repo: config.githubRepo,
      })
    : null

  const pipelineService = createPipelineService({
    github,
    cache: createTtlCache(30_000),
    stagingUrl,
  })

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'platform-api' })
  })

  app.get(
    '/api/ready',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
    async (_request, response, next) => {
      try {
        await pool.query('SELECT 1')
        response.json({ status: 'ready', database: 'connected' })
      } catch (error) {
        next(error)
      }
    }
  )

  app.post(
    '/api/contacts',
    rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
    async (request, response, next) => {
      try {
        const contact = contactSchema.parse(request.body)
        const result = await pool.query(
          `INSERT INTO contacts (name, email, message)
           VALUES ($1, $2, $3)
           RETURNING id, created_at`,
          [contact.name, contact.email, contact.message]
        )
        response.status(201).json({
          id: result.rows[0].id,
          createdAt: result.rows[0].created_at,
          message: 'Contact request received',
        })
      } catch (error) {
        next(error)
      }
    }
  )

  app.use(
    '/api/pipelines',
    createPipelinesRouter({
      config: { ...config, stagingUrl },
      pipelineService,
    })
  )

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' })
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      return response.status(400).json({
        error: 'Validation failed',
        details: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    if (error instanceof GithubApiError) {
      return response.status(502).json({
        error: 'GitHub API request failed',
        message: error.message,
      })
    }
    console.error(error)
    return response.status(503).json({ error: 'Service unavailable' })
  })

  return app
}
