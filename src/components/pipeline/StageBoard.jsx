import StatusBadge from './StatusBadge'

function StageBoard({ stages = [] }) {
  if (!stages.length) {
    return <p className="text-sm text-slate-500">No step details available.</p>
  }

  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => (
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
            {stage.jobs?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {stage.jobs.map(job => (
                  <li key={job.id} className="flex flex-wrap items-center gap-2">
                    <span>{job.name}</span>
                    <StatusBadge status={job.conclusion || job.status} />
                    {job.htmlUrl ? (
                      <a
                        href={job.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        View details
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No jobs for this step yet.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default StageBoard
