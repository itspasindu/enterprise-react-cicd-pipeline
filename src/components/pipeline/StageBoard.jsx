import StatusBadge from './StatusBadge'

function jobDurationMs(job) {
  if (!job?.startedAt) return null
  const start = new Date(job.startedAt).getTime()
  if (Number.isNaN(start)) return null
  const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
  if (Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`
}

function StageBoard({ stages = [] }) {
  if (!stages.length) {
    return <p className="text-sm text-slate-500">No step details available.</p>
  }

  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => {
        const jobs = stage.jobs || []
        const durations = jobs.map(jobDurationMs).filter(ms => ms !== null)
        const maxMs = Math.max(1, ...durations, 1)

        return (
          <li
            key={stage.key}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{stage.name}</h3>
                <StatusBadge status={stage.conclusion || stage.status} />
              </div>
              {jobs.length ? (
                <ul className="mt-3 space-y-2">
                  {jobs.map(job => {
                    const ms = jobDurationMs(job)
                    const width = ms === null ? 0 : Math.max(6, Math.round((ms / maxMs) * 100))
                    const bar =
                      (job.conclusion || job.status || '').toLowerCase() === 'failure'
                        ? 'bg-rose-400'
                        : (job.conclusion || job.status || '').toLowerCase() === 'success'
                          ? 'bg-emerald-400'
                          : 'bg-sky-400'
                    return (
                      <li
                        key={job.id}
                        className="rounded-xl border border-slate-200 bg-white p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-700">{job.name}</span>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={job.conclusion || job.status} />
                            <span className="tabular-nums text-slate-500">
                              {formatDuration(ms) || '—'}
                            </span>
                            {job.htmlUrl ? (
                              <a
                                href={job.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-700 hover:underline"
                              >
                                View
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${bar}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No jobs for this step yet.</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default StageBoard
