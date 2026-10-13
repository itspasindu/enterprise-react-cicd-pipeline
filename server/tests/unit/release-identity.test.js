import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import {
  extractZipEntry,
  parseReleaseIdentityFromArtifactName,
  parseReleaseIdentityFromJson,
} from '../../src/github/zip.js'
import { buildDeployTimeline } from '../../src/github/pipelines.js'

function buildStoreZip(entries) {
  const parts = []
  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0, 6)
    header.writeUInt16LE(0, 8) // store
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(0, 12)
    header.writeUInt32LE(0, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBuf.length, 26)
    header.writeUInt16LE(0, 28)
    parts.push(header, nameBuf, data)
  }
  return Buffer.concat(parts)
}

function buildDeflateZip(name, content) {
  const nameBuf = Buffer.from(name, 'utf8')
  const raw = Buffer.from(content, 'utf8')
  const data = deflateRawSync(raw)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(8, 8) // deflate
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(data.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBuf.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, nameBuf, data])
}

describe('release identity helpers', () => {
  it('parses CalVer artifact names', () => {
    expect(parseReleaseIdentityFromArtifactName('release-2026.10.6-abc1234')).toMatchObject({
      version: '2026.10.6',
      shortSha: 'abc1234',
    })
    expect(parseReleaseIdentityFromArtifactName('web-coverage')).toBeNull()
  })

  it('parses release.json payloads', () => {
    const identity = parseReleaseIdentityFromJson(
      JSON.stringify({
        version: '2026.10.6',
        commit: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2026-10-01T00:00:00Z',
        images: {
          web: {
            tag: '2026.10.6',
            digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            reference:
              'ghcr.io/acme/platform-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            imageId: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
          api: {
            tag: '2026.10.6',
            digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            reference:
              'ghcr.io/acme/platform-api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            imageId: '',
          },
        },
      })
    )
    expect(identity.version).toBe('2026.10.6')
    expect(identity.images.web.imageId).toMatch(/^sha256:/)
    expect(identity.images.api.imageId).toBeNull()
  })

  it('extracts release.json from store and deflate zips', () => {
    const payload = JSON.stringify({ version: '2026.10.6', commit: 'abc', images: {} })
    const storeZip = buildStoreZip({ 'release.json': payload, 'other.txt': 'x' })
    expect(extractZipEntry(storeZip, 'release.json').toString('utf8')).toBe(payload)

    const deflateZip = buildDeflateZip('release.json', payload)
    expect(extractZipEntry(deflateZip, 'release.json').toString('utf8')).toBe(payload)
  })
})

describe('deploy timeline', () => {
  it('maps CD deploy job steps into a timeline', () => {
    const timeline = buildDeployTimeline([
      {
        name: 'Deploy Full Stack to Staging',
        html_url: 'https://github.com/acme/platform/actions/runs/1/job/2',
        steps: [
          {
            name: 'Verify immutable release bundle',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-10-01T00:00:00Z',
            completed_at: '2026-10-01T00:00:10Z',
          },
          {
            name: 'Pull immutable release digests',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-10-01T00:00:10Z',
            completed_at: '2026-10-01T00:01:10Z',
          },
          {
            name: 'Transfer bundle and images',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-10-01T00:01:10Z',
            completed_at: '2026-10-01T00:02:10Z',
          },
          {
            name: 'Deploy Compose stack',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-10-01T00:02:10Z',
            completed_at: '2026-10-01T00:03:10Z',
          },
          {
            name: 'External smoke tests',
            status: 'completed',
            conclusion: 'failure',
            started_at: '2026-10-01T00:03:10Z',
            completed_at: '2026-10-01T00:03:40Z',
          },
        ],
      },
    ])

    expect(timeline.map(step => step.key)).toEqual([
      'verify',
      'pull',
      'transfer',
      'rollout',
      'smoke',
    ])
    expect(timeline.at(-1).conclusion).toBe('failure')
    expect(timeline[0].durationMs).toBe(10_000)
    expect(timeline[0].jobHtmlUrl).toContain('/job/2')
  })
})
