const STYLE_BY_STATUS = new Map([
  ['success', 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm shadow-emerald-500/10'],
  ['failure', 'bg-rose-50 text-rose-800 border-rose-200 shadow-sm shadow-rose-500/10'],
  ['cancelled', 'bg-amber-50 text-amber-800 border-amber-200'],
  ['skipped', 'bg-slate-100 text-slate-600 border-slate-200'],
  ['in_progress', 'bg-sky-50 text-sky-800 border-sky-200 shadow-sm shadow-sky-500/10'],
  ['queued', 'bg-sky-50 text-sky-700 border-sky-200'],
  ['neutral', 'bg-slate-100 text-slate-600 border-slate-200'],
  ['unknown', 'bg-slate-100 text-slate-500 border-slate-200'],
])

const DOT_BY_STATUS = new Map([
  ['success', 'bg-emerald-500'],
  ['failure', 'bg-rose-500'],
  ['cancelled', 'bg-amber-500'],
  ['skipped', 'bg-slate-400'],
  ['in_progress', 'bg-sky-500 animate-pulse'],
  ['queued', 'bg-sky-400 animate-pulse'],
  ['neutral', 'bg-slate-400'],
  ['unknown', 'bg-slate-400'],
])

const LABEL_BY_STATUS = new Map([
  ['success', 'Passed'],
  ['failure', 'Needs attention'],
  ['cancelled', 'Cancelled'],
  ['skipped', 'Skipped'],
  ['in_progress', 'Running'],
  ['queued', 'Waiting'],
  ['neutral', 'OK'],
  ['unknown', 'Unknown'],
])

function normalizeStatus(status) {
  const key = String(status || 'unknown')
    .toLowerCase()
    .replace(/\s+/g, '_')
  return STYLE_BY_STATUS.has(key) ? key : 'unknown'
}

function StatusBadge({ status, className = '' }) {
  const key = normalizeStatus(status)
  const style = STYLE_BY_STATUS.get(key)
  const label = LABEL_BY_STATUS.get(key)
  const dot = DOT_BY_STATUS.get(key)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}

export default StatusBadge
