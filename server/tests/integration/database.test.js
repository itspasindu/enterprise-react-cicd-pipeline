import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const { Pool } = pg
const databaseUrl = process.env.DATABASE_URL
const run = databaseUrl ? describe : describe.skip
let pool

run('PostgreSQL integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl })
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(254) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('can insert and read a contact', async () => {
    const inserted = await pool.query(
      'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3) RETURNING id',
      ['Integration User', 'integration@example.com', 'Database integration test']
    )
    const result = await pool.query('SELECT email FROM contacts WHERE id = $1', [
      inserted.rows[0].id,
    ])
    expect(result.rows[0].email).toBe('integration@example.com')
  })
})
