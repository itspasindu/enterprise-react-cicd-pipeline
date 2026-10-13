import StatusBadge from './StatusBadge'

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`
}

function DeployTimeline({ steps = [] }) {
  if (!steps.length) {
    return (
      <p className="text-sm text-slate-500">
        Deploy timing appears after a release run reports transfer, rollout, and smoke steps.
      </p>
    )
  }

  const durations = steps.map(step => step.durationMs).filter(ms => typeof ms === 'number')
  const maxMs = Math.max(1, ...durations, 1)

  return (
    <ol className="space-y-2" data-testid="deploy-timeline">
      {steps.map((step, index) => {
        const width =
          typeof step.durationMs === 'number'
            ? Math.max(6, Math.round((step.durationMs / maxMs) * 100))
            : 0
        const bar =
          (step.conclusion || '').toLowerCase() === 'failure'
            ? 'bg-rose-400'
            : (step.conclusion || '').toLowerCase() === 'success'
              ? 'bg-emerald-400'
              : 'bg-sky-400'
        return (
          <li
            key={step.key || `${step.name}-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <span className="font-semibold text-slate-900">{step.label || step.name}</span>
                <StatusBadge status={step.conclusion || step.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="tabular-nums">{formatDuration(step.durationMs)}</span>
                {step.jobHtmlUrl ? (
                  <a
                    href={step.jobHtmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    Logs
                  </a>
                ) : null}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default DeployTimeline
