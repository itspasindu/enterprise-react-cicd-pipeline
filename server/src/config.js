import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default('postgres://platform:platform@localhost:5432/platform'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  GITHUB_TOKEN: z.string().optional().default(''),
  GITHUB_OWNER: z.string().optional().default(''),
  GITHUB_REPO: z.string().optional().default(''),
  STAGING_URL: z.string().optional().default('http://localhost:4173'),
})

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${parsed.error.message}`)
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    databaseSsl: parsed.data.DATABASE_SSL === 'true',
    githubToken: parsed.data.GITHUB_TOKEN.trim(),
    githubOwner: parsed.data.GITHUB_OWNER.trim(),
    githubRepo: parsed.data.GITHUB_REPO.trim(),
    stagingUrl: parsed.data.STAGING_URL.replace(/\/$/, ''),
  }
}

export function isGithubConfigured(config) {
  return Boolean(config.githubToken && config.githubOwner && config.githubRepo)
}
