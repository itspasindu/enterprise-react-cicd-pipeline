function LiveStatusBar({ live = false, isFetching = false, updatedAt, onRefresh, owner, repo }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="pipeline-live-bar"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              live ? 'bg-emerald-500' : 'bg-amber-400'
            } ${isFetching ? 'animate-pulse' : ''}`}
            aria-hidden
          />
          <span className="font-semibold text-slate-800">
            {live ? 'Connected — updating automatically' : 'Setup needed for live updates'}
          </span>
        </span>
        {live && owner && repo ? (
          <span className="text-xs text-slate-500">
            Watching {owner}/{repo}
          </span>
        ) : null}
        {updatedAt ? (
          <span className="text-xs text-slate-500">
            Last checked {new Date(updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isFetching ? 'Updating…' : 'Refresh'}
        </button>
      ) : null}
    </div>
  )
}

export default LiveStatusBar
