import { loadLocalEnv } from './load-env.js'
import { createApp } from './app.js'
import { loadConfig, isGithubConfigured } from './config.js'
import { createPool } from './db.js'

loadLocalEnv()

const config = loadConfig()
const pool = createPool(config)
const app = createApp({ pool, config })

const server = app.listen(config.port, () => {
  console.warn(`platform-api listening on ${config.port}`)
  if (isGithubConfigured(config)) {
    console.warn(`pipeline monitor: live GitHub mode (${config.githubOwner}/${config.githubRepo})`)
  } else {
    console.warn('pipeline monitor: set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO for live data')
  }
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
