function LiveStatusBar({ live = false, isFetching = false, updatedAt, onRefresh, owner, repo }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${
        live
          ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-white'
          : 'border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-white'
      }`}
      data-testid="pipeline-live-bar"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {live ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            ) : null}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                live ? 'bg-emerald-500' : 'bg-amber-400'
              } ${isFetching ? 'animate-pulse' : ''}`}
              aria-hidden
            />
          </span>
          <span className="font-bold text-slate-800">
            {live ? 'Connected — updating automatically' : 'Setup needed for live updates'}
          </span>
        </span>
        {live && owner && repo ? (
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">
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
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {isFetching ? 'Updating…' : 'Refresh'}
        </button>
      ) : null}
    </div>
  )
}

export default LiveStatusBar
