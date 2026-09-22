import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

function baseConfig(overrides = {}) {
  return {
    stagingUrl: 'http://localhost:4173',
    githubToken: '',
    githubOwner: '',
    githubRepo: '',
    ...overrides,
  }
}

describe('pipelines API', () => {
  it('reports pipeline status without requiring GitHub', async () => {
    const app = createApp({
      pool: { query: vi.fn() },
      config: baseConfig(),
    })
    const response = await request(app).get('/api/pipelines/status')
    expect(response.status).toBe(200)
    expect(response.body.configured).toBe(false)
    expect(response.body.live).toBe(false)
    expect(response.body.hint).toMatch(/GITHUB_TOKEN/)
  })

  it('returns 503 with setup hint when GitHub is not configured', async () => {
    const app = createApp({
      pool: { query: vi.fn() },
      config: baseConfig(),
    })
    const response = await request(app).get('/api/pipelines/overview')
    expect(response.status).toBe(503)
    expect(response.body.error).toMatch(/not configured/i)
    expect(response.body.hint).toMatch(/GITHUB_TOKEN/)
  })

  it('proxies overview when GitHub is configured', async () => {
    const fetchImpl = vi.fn(async url => {
      const href = String(url)
      if (href.includes('/actions/workflows/ci.yml/runs')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              workflow_runs: [
                {
                  id: 100,
                  name: 'CI',
                  path: '.github/workflows/ci.yml',
                  status: 'completed',
                  conclusion: 'success',
                  event: 'push',
                  head_branch: 'main',
                  head_sha: 'abc1234567890',
                  html_url: 'https://github.com/acme/platform/actions/runs/100',
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:05:00Z',
                  run_started_at: '2026-01-01T00:00:00Z',
                  actor: { login: 'alice' },
                },
              ],
            }),
        }
      }
      if (href.includes('/actions/workflows/cd.yml/runs')) {
        return { ok: true, text: async () => JSON.stringify({ workflow_runs: [] }) }
      }
      if (href.includes('/actions/runs/100/jobs')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              jobs: [
                {
                  id: 1,
                  name: 'Test Full Stack',
                  status: 'completed',
                  conclusion: 'success',
                  html_url: 'https://example.com/job/1',
                  started_at: '2026-01-01T00:00:00Z',
                  completed_at: '2026-01-01T00:04:00Z',
                },
              ],
            }),
        }
      }
      if (href.includes('/actions/runs/100/artifacts')) {
        return { ok: true, text: async () => JSON.stringify({ artifacts: [] }) }
      }
      if (href.includes('/actions/runs/100')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              id: 100,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              status: 'completed',
              conclusion: 'success',
              event: 'push',
              head_branch: 'main',
              head_sha: 'abc1234567890',
              html_url: 'https://github.com/acme/platform/actions/runs/100',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:05:00Z',
              actor: { login: 'alice' },
            }),
        }
      }
      if (href.includes('/issues')) {
        return { ok: true, text: async () => JSON.stringify([]) }
      }
      // staging probes
      return { ok: true, status: 200, text: async () => '{}' }
    })

    // Inject fetch via creating app with real service is hard — instead mount with custom createApp path.
    // We patch global fetch for this test.
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchImpl

    try {
      const app = createApp({
        pool: { query: vi.fn() },
        config: baseConfig({
          githubToken: 'ghp_test',
          githubOwner: 'acme',
          githubRepo: 'platform',
        }),
      })

      const response = await request(app).get('/api/pipelines/overview')
      expect(response.status).toBe(200)
      expect(response.body.latestCi).toMatchObject({ id: 100, workflow: 'ci', conclusion: 'success' })
      expect(response.body.openFailureCount).toBe(0)
      expect(Array.isArray(response.body.stages)).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

