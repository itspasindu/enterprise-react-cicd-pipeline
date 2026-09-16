import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default('postgres://platform:platform@localhost:5432/platform'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
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
  }
}
