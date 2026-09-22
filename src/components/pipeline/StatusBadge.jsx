const STYLE_BY_STATUS = new Map([
  ['success', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  ['failure', 'bg-rose-50 text-rose-800 border-rose-200'],
  ['cancelled', 'bg-amber-50 text-amber-800 border-amber-200'],
  ['skipped', 'bg-slate-100 text-slate-600 border-slate-200'],
  ['in_progress', 'bg-sky-50 text-sky-800 border-sky-200'],
  ['queued', 'bg-sky-50 text-sky-700 border-sky-200'],
  ['neutral', 'bg-slate-100 text-slate-600 border-slate-200'],
  ['unknown', 'bg-slate-100 text-slate-500 border-slate-200'],
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

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}
    >
      {label}
    </span>
  )
}

export default StatusBadge
