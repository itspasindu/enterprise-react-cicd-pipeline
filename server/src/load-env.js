import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  const key = trimmed.slice(0, eq).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return { key, value }
}

function applyEnvValue(key, value) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) return
  // Keys are validated as [A-Za-z_][A-Za-z0-9_]* before this call.
  Object.defineProperty(process.env, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

/**
 * Load KEY=VALUE pairs into process.env without overriding existing vars.
 * Supports repo-root `.env` for local `npm run api:dev`.
 */
export function loadLocalEnv(fromDir = process.cwd()) {
  const candidates = [resolve(fromDir, '.env'), resolve(fromDir, '..', '.env')]

  for (const filePath of candidates) {
    // Trusted local bootstrap paths only (.env next to cwd / parent).
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed relative .env candidates
    if (!existsSync(filePath)) continue
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed relative .env candidates
    const text = readFileSync(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const parsed = parseEnvLine(rawLine)
      if (!parsed) continue
      applyEnvValue(parsed.key, parsed.value)
    }
  }
}
