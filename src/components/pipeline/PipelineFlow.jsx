import StatusBadge from './StatusBadge'

const NODE_STYLES = new Map([
  ['success', 'border-emerald-200 bg-emerald-50'],
  ['failure', 'border-rose-200 bg-rose-50'],
  ['cancelled', 'border-amber-200 bg-amber-50'],
  ['skipped', 'border-slate-200 bg-slate-50 opacity-80'],
  ['in_progress', 'border-sky-300 bg-sky-50 animate-pulse'],
  ['queued', 'border-sky-200 bg-sky-50 animate-pulse'],
  ['neutral', 'border-slate-200 bg-slate-50'],
  ['unknown', 'border-slate-200 bg-white'],
])

function statusKey(status) {
  const key = String(status || 'unknown')
    .toLowerCase()
    .replace(/\s+/g, '_')
  return NODE_STYLES.has(key) ? key : 'unknown'
}

function connectorClass(leftStatus) {
  const left = statusKey(leftStatus)
  if (left === 'failure') return 'bg-rose-300'
  if (left === 'in_progress' || left === 'queued') return 'bg-sky-300'
  if (left === 'success') return 'bg-emerald-300'
  return 'bg-slate-200'
}

function PipelineFlow({ stages = [], title = 'Release steps' }) {
  if (!stages.length) {
    return <p className="text-sm text-slate-500">No steps to show yet.</p>
  }

  return (
    <div data-testid="pipeline-flow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="text-xs text-slate-500">{stages.length} steps</span>
      </div>
      <div className="overflow-x-auto pb-2">
        <ol className="flex min-w-max items-stretch gap-0">
          {stages.map((stage, index) => {
            const conclusion = stage.conclusion || stage.status
            const nodeStyle = NODE_STYLES.get(statusKey(conclusion))
            const next = stages[index + 1]
            return (
              <li key={stage.key} className="flex items-center">
                <div
                  className={`w-40 rounded-2xl border px-3 py-3 shadow-sm ${nodeStyle}`}
                  title={stage.name}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Step {index + 1}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                    {stage.name}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={conclusion} />
                  </div>
                </div>
                {next ? (
                  <div
                    className={`mx-1 h-0.5 w-6 shrink-0 rounded ${connectorClass(conclusion)}`}
                    aria-hidden
                  />
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export default PipelineFlow
