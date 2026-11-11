import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { validateRun, validateMetadata, signArchive, verifyArchive } from '../release-trust.mjs'

const repository = 'acme/platform'
const run = {
  id: 42, repository: { full_name: repository }, head_repository: { full_name: repository },
  path: '.github/workflows/ci.yml', head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), run_attempt: 2,
}
const metadata = {
  repository, workflowRunId: '42', workflowRunAttempt: '2', commit: run.head_sha,
  runtime: 'host-node', version: '2026.11.1', directoryName: `2026.11.1-${run.head_sha}`,
}

test('accepts main push and manual CI with matching signed metadata', () => {
  validateMetadata(metadata, run, repository, '42')
  validateMetadata(metadata, { ...run, event: 'workflow_dispatch' }, repository, '42')
})

for (const [field, value] of Object.entries({
  id: 43, repository: { full_name: 'other/repo' }, head_repository: { full_name: 'fork/platform' },
  path: '.github/workflows/other.yml', head_branch: 'feature', event: 'pull_request',
  status: 'in_progress', conclusion: 'failure', head_sha: '../invalid',
})) {
  test(`rejects untrusted run ${field}`, () => {
    assert.throws(() => validateRun({ ...run, [field]: value }, repository, '42'))
  })
}
for (const [field, value] of Object.entries({
  repository: 'other/repo', workflowRunId: '41', workflowRunAttempt: '1', commit: 'b'.repeat(40),
  runtime: 'other', version: '../escape', directoryName: '../escape',
})) {
  test(`rejects mismatched release ${field}`, () => {
    assert.throws(() => validateMetadata({ ...metadata, [field]: value }, run, repository, '42'))
  })
}
test('rejects malformed run IDs', () => {
  for (const id of ['', '../42', '42\nid=1']) assert.throws(() => validateRun(run, repository, id))
})

test('signature rejects modified payloads, signatures, and untrusted keys', () => {
  const options = { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }
  const keys = generateKeyPairSync('ed25519', options)
  const other = generateKeyPairSync('ed25519', options)
  const archive = Buffer.from('release archive including metadata and executable scripts')
  const signature = signArchive(archive, keys.privateKey)
  verifyArchive(archive, signature, keys.publicKey)
  assert.throws(() => verifyArchive(Buffer.from('tampered'), signature, keys.publicKey))
  assert.throws(() => verifyArchive(archive, Buffer.alloc(64), keys.publicKey))
  assert.throws(() => verifyArchive(archive, signature, other.publicKey))
  assert.throws(() => verifyArchive(archive, signature, ''))
  assert.throws(() => signArchive(archive, ''))
})
