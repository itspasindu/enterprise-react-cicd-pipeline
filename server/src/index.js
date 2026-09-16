import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'

const config = loadConfig()
const pool = createPool(config)
const app = createApp({ pool })

const server = app.listen(config.port, () => {
  console.warn(`platform-api listening on ${config.port}`)
})

async function shutdown(signal) {
  console.warn(`Received ${signal}; shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
