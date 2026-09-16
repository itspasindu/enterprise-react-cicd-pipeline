import pg from 'pg'
import { loadConfig } from './config.js'

const { Pool } = pg

export function createPool(config = loadConfig()) {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}
