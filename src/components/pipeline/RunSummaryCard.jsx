import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { pipelineRunPath } from '../../config/app-contract'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function RunSummaryCard({ run }) {
  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        No recent run yet.
      </div>
    )
  }

  const kind = run.workflow === 'ci' ? 'Build & checks' : run.workflow === 'cd' ? 'Release' : 'Run'

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {kind}
          </span>
          <StatusBadge status={run.conclusion || run.status} />
        </div>
        <Link
          to={pipelineRunPath(run.id)}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          View details
        </Link>
      </div>
      <div>
        <p className="font-semibold text-slate-900">{run.displayTitle || run.name}</p>
        <p className="mt-1 text-sm text-slate-600">
          Branch {run.branch} · by {run.actor || 'unknown'}
        </p>
        <p className="mt-1 text-xs text-slate-500">{formatWhen(run.createdAt)}</p>
      </div>
      {run.htmlUrl ? (
        <a
          href={run.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-blue-700 hover:underline"
        >
          Open on GitHub
        </a>
      ) : null}
    </div>
  )
}

export default RunSummaryCard
