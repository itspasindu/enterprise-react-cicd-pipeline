import { Link } from 'react-router-dom'
import { pipelineRunPath } from '../../config/app-contract'

function shortDigest(value) {
  if (!value) return '—'
  const text = String(value)
  if (text.startsWith('sha256:') && text.length > 19) {
    return `${text.slice(0, 15)}…`
  }
  if (text.includes('@sha256:') && text.length > 40) {
    const [repo, digest] = text.split('@')
    return `${repo.split('/').pop()}@${digest.slice(0, 15)}…`
  }
  if (text.startsWith('sha256:') === false && text.length > 20 && /^[0-9a-f]+$/i.test(text)) {
    return `${text.slice(0, 12)}…`
  }
  return text.length > 48 ? `${text.slice(0, 45)}…` : text
}

function ImageRow({ label, image }) {
  if (!image) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <dl className="mt-1 space-y-0.5 text-xs text-slate-700">
        {image.tag ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">Tag</dt>
            <dd className="font-mono">{image.tag}</dd>
          </div>
        ) : null}
        {image.digest || image.reference ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">Digest</dt>
            <dd className="font-mono" title={image.reference || image.digest}>
              {shortDigest(image.reference || image.digest)}
            </dd>
          </div>
        ) : null}
        {image.imageId ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">imageId</dt>
            <dd className="font-mono" title={image.imageId}>
              {shortDigest(image.imageId)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

function ReleaseIdentityCard({ release }) {
  if (!release) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        No release identity yet — it appears after CI publishes a release bundle or CD deploys one.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="release-identity-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="section-label">Release identity</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            {release.version || 'Unknown version'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Commit{' '}
            <span className="font-mono">
              {release.shortSha || release.commit?.slice(0, 7) || '—'}
            </span>
            {release.createdAt ? ` · ${new Date(release.createdAt).toLocaleString()}` : null}
          </p>
        </div>
        {release.sourceRunId ? (
          <Link
            to={pipelineRunPath(release.sourceRunId)}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            Source run
          </Link>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ImageRow label="Web" image={release.images?.web} />
        <ImageRow label="API" image={release.images?.api} />
      </div>
    </div>
  )
}

export default ReleaseIdentityCard
