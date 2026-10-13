import { inflateRawSync } from 'node:zlib'

const LOCAL_FILE_HEADER = 0x04034b50

/**
 * Extract a single entry from a ZIP buffer (store or deflate).
 * Sufficient for small GitHub Actions artifacts such as release.json.
 */
export function extractZipEntry(input, entryName) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  let offset = 0

  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
      const next = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 1)
      if (next === -1) break
      offset = next
      continue
    }

    const compression = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLen = buffer.readUInt16LE(offset + 26)
    const extraLen = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen > buffer.length) break

    const name = buffer.subarray(nameStart, nameEnd).toString('utf8')
    const dataStart = nameEnd + extraLen
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buffer.length) break

    const data = buffer.subarray(dataStart, dataEnd)
    const basename = name.split('/').pop()
    if (name === entryName || basename === entryName) {
      if (compression === 0) return data
      if (compression === 8) return inflateRawSync(data)
      throw new Error(`Unsupported ZIP compression method: ${compression}`)
    }

    offset = dataEnd
  }

  return null
}

export function parseReleaseIdentityFromJson(raw) {
  let parsed
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(Buffer.from(raw).toString('utf8'))
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null

  const web = parsed.images?.web || {}
  const api = parsed.images?.api || {}
  const emptyToNull = value => {
    if (value === undefined || value === null || value === '' || value === 'null') return null
    return String(value)
  }

  return {
    version: emptyToNull(parsed.version),
    commit: emptyToNull(parsed.commit),
    shortSha: emptyToNull(parsed.commit)?.slice(0, 7) || null,
    createdAt: emptyToNull(parsed.createdAt),
    workflowRunId: emptyToNull(parsed.workflowRunId),
    repository: emptyToNull(parsed.repository),
    images: {
      web: {
        tag: emptyToNull(web.tag),
        digest: emptyToNull(web.digest),
        reference: emptyToNull(web.reference),
        imageId: emptyToNull(web.imageId),
      },
      api: {
        tag: emptyToNull(api.tag),
        digest: emptyToNull(api.digest),
        reference: emptyToNull(api.reference),
        imageId: emptyToNull(api.imageId),
      },
    },
  }
}

/** Parse CalVer + sha from artifact names like release-2026.10.6-abcdef1 */
export function parseReleaseIdentityFromArtifactName(name) {
  if (!name) return null
  const match = String(name).match(/^release-(\d{4}\.\d{1,2}\.\d+)-([0-9a-f]{7,40})$/i)
  if (!match) return null
  return {
    version: match[1],
    commit: match[2].length >= 40 ? match[2] : null,
    shortSha: match[2].slice(0, 7),
    createdAt: null,
    workflowRunId: null,
    repository: null,
    images: {
      web: { tag: null, digest: null, reference: null, imageId: null },
      api: { tag: null, digest: null, reference: null, imageId: null },
    },
  }
}
