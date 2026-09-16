import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

function appWith(query = vi.fn().mockResolvedValue({ rows: [{ id: 1, created_at: new Date() }] })) {
  return { app: createApp({ pool: { query } }), query }
}

describe('API', () => {
  it('reports liveness', async () => {
    const { app } = appWith()
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('reports database readiness', async () => {
    const { app, query } = appWith()
    const response = await request(app).get('/api/ready')
    expect(response.status).toBe(200)
    expect(query).toHaveBeenCalledWith('SELECT 1')
  })

  it('validates contact requests', async () => {
    const { app } = appWith()
    const response = await request(app).post('/api/contacts').send({ name: 'x' })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation failed')
  })

  it('stores valid contact requests with parameterized SQL', async () => {
    const { app, query } = appWith()
    const response = await request(app)
      .post('/api/contacts')
      .send({ name: 'Test User', email: 'test@example.com', message: 'Hello from test' })
    expect(response.status).toBe(201)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO contacts'), [
      'Test User',
      'test@example.com',
      'Hello from test',
    ])
  })
})
