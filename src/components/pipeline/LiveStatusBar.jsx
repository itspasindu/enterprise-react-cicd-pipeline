function LiveStatusBar({
  live = false,
  isFetching = false,
  updatedAt,
  onRefresh,
  owner,
  repo,
  stagingUrl,
  github,
  paused = false,
  interval = 'auto',
  intervalOptions = [],
  onTogglePause,
  onIntervalChange,
}) {
  const egressOk = github?.reachable === true
  const egressConfigured = github?.configured === true

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
            {live && !paused ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            ) : null}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                live ? (paused ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-amber-400'
              } ${isFetching ? 'animate-pulse' : ''}`}
              aria-hidden
            />
          </span>
          <span className="font-bold text-slate-800">
            {!live
              ? 'Setup needed for live updates'
              : paused
                ? 'Paused — updates on demand'
                : 'Connected — updating automatically'}
          </span>
        </span>
        {live && owner && repo ? (
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">
            Watching {owner}/{repo}
          </span>
        ) : null}
        {egressConfigured ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
              egressOk
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
            title={
              github?.error || (egressOk ? 'api.github.com reachable' : 'GitHub egress failed')
            }
            data-testid="github-egress-badge"
          >
            {egressOk
              ? `GitHub OK${github?.latencyMs != null ? ` · ${github.latencyMs}ms` : ''}`
              : 'GitHub unreachable'}
          </span>
        ) : null}
        {stagingUrl ? (
          <span
            className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate-500 border border-slate-200"
            title="STAGING_URL used for live website probes"
          >
            Staging {stagingUrl}
          </span>
        ) : null}
        {updatedAt ? (
          <span className="text-xs text-slate-500">
            Last checked {new Date(updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onIntervalChange ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-semibold">Refresh</span>
            <select
              value={interval}
              onChange={event => onIntervalChange(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              disabled={paused}
            >
              {intervalOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {onTogglePause ? (
          <button
            type="button"
            onClick={onTogglePause}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        ) : null}
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
    </div>
  )
}

export default LiveStatusBar
