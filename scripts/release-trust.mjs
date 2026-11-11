import { readFileSync, writeFileSync } from 'node:fs'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { pathToFileURL } from 'node:url'

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateRun(run, repository, id) {
  requireValue(/^[1-9][0-9]*$/.test(String(id)), 'Invalid CI run ID')
  requireValue(String(run.id) === String(id), 'CI run ID mismatch')
  requireValue(run.repository?.full_name === repository && run.head_repository?.full_name === repository, 'Repository mismatch')
  requireValue(run.path === '.github/workflows/ci.yml', 'Unexpected source workflow')
  requireValue(run.head_branch === 'main', 'Only main releases may deploy')
  requireValue(['push', 'workflow_dispatch'].includes(run.event), 'Untrusted CI event')
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'CI must complete successfully')
  requireValue(/^[0-9a-f]{40}$/.test(run.head_sha), 'Invalid source commit')
}

export function validateMetadata(metadata, run, repository, id) {
  validateRun(run, repository, id)
  requireValue(metadata.repository === repository, 'Release repository mismatch')
  requireValue(metadata.workflowRunId === String(id), 'Release run mismatch')
  requireValue(metadata.commit === run.head_sha, 'Release commit mismatch')
  requireValue(metadata.workflowRunAttempt === String(run.run_attempt), 'Release attempt mismatch')
  requireValue(metadata.runtime === 'host-node', 'Unexpected release runtime')
  requireValue(/^\d{4}\.\d{2}\.\d+$/.test(metadata.version), 'Invalid release version')
  requireValue(metadata.directoryName === `${metadata.version}-${metadata.commit}`, 'Invalid release directory')
}

export function signArchive(archive, privatePem) {
  const key = createPrivateKey(privatePem)
  requireValue(key.asymmetricKeyType === 'ed25519', 'An Ed25519 private key is required')
  return sign(null, archive, key)
}

export function verifyArchive(archive, signature, publicPem) {
  const key = createPublicKey(publicPem)
  requireValue(key.asymmetricKeyType === 'ed25519', 'An Ed25519 public key is required')
  requireValue(verify(null, archive, key, signature), 'Invalid release signature')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, file, extra] = process.argv.slice(2)
    const json = path => JSON.parse(readFileSync(path, 'utf8'))
    if (command === 'sign') {
      writeFileSync(`${file}.sig`, signArchive(readFileSync(file), process.env.RELEASE_SIGNING_PRIVATE_KEY))
    } else if (command === 'verify') {
      verifyArchive(readFileSync(file), readFileSync(`${file}.sig`), process.env.RELEASE_SIGNING_PUBLIC_KEY)
    } else if (command === 'run') {
      validateRun(json(file), process.env.GITHUB_REPOSITORY, process.env.RUN_ID)
    } else if (command === 'metadata') {
      validateMetadata(json(file), json(extra), process.env.GITHUB_REPOSITORY, process.env.RUN_ID)
    } else throw new Error('Expected sign, verify, run, or metadata')
  } catch (error) {
    console.error(`Release trust check failed: ${error.message}`)
    process.exitCode = 1
  }
}
