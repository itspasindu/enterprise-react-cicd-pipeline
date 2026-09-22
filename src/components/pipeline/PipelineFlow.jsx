import StatusBadge from './StatusBadge'

const NODE_STYLES = new Map([
  ['success', 'border-emerald-200 bg-emerald-50'],
  ['failure', 'border-rose-200 bg-rose-50'],
  ['cancelled', 'border-amber-200 bg-amber-50'],
  ['skipped', 'border-slate-200 bg-slate-50 opacity-80'],
  ['in_progress', 'border-sky-300 bg-sky-50'],
  ['queued', 'border-sky-200 bg-sky-50'],
  ['neutral', 'border-slate-200 bg-slate-50'],
  ['unknown', 'border-slate-200 bg-white'],
])

const DOT_STYLES = new Map([
  ['success', 'bg-emerald-500'],
  ['failure', 'bg-rose-500'],
  ['cancelled', 'bg-amber-500'],
  ['skipped', 'bg-slate-300'],
  ['in_progress', 'bg-sky-500 animate-pulse'],
  ['queued', 'bg-sky-400 animate-pulse'],
  ['neutral', 'bg-slate-400'],
  ['unknown', 'bg-slate-300'],
])

const BAR_STYLES = new Map([
  ['success', 'bg-emerald-500'],
  ['failure', 'bg-rose-500'],
  ['cancelled', 'bg-amber-500'],
  ['skipped', 'bg-slate-300'],
  ['in_progress', 'bg-sky-500'],
  ['queued', 'bg-sky-400'],
  ['neutral', 'bg-slate-400'],
  ['unknown', 'bg-slate-300'],
])

const ICONS = new Map([
  ['success', '✓'],
  ['failure', '!'],
  ['cancelled', '×'],
  ['skipped', '–'],
  ['in_progress', '…'],
  ['queued', '…'],
  ['neutral', '•'],
  ['unknown', '?'],
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

function stageDurationMs(stage) {
  const jobs = stage.jobs || []
  if (!jobs.length) return null
  let start = null
  let end = null
  for (const job of jobs) {
    if (job.startedAt) {
      const t = new Date(job.startedAt).getTime()
      if (!Number.isNaN(t) && (start === null || t < start)) start = t
    }
    if (job.completedAt) {
      const t = new Date(job.completedAt).getTime()
      if (!Number.isNaN(t) && (end === null || t > end)) end = t
    }
  }
  if (start === null) return null
  if (end === null) {
    const key = statusKey(stage.conclusion || stage.status)
    if (key === 'in_progress' || key === 'queued') return Math.max(0, Date.now() - start)
    return null
  }
  return Math.max(0, end - start)
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`
}

function summarizeStages(stages) {
  const counts = {
    success: 0,
    failure: 0,
    in_progress: 0,
    queued: 0,
    skipped: 0,
    other: 0,
  }
  for (const stage of stages) {
    const key = statusKey(stage.conclusion || stage.status)
    switch (key) {
      case 'success':
        counts.success += 1
        break
      case 'failure':
        counts.failure += 1
        break
      case 'in_progress':
        counts.in_progress += 1
        break
      case 'queued':
        counts.queued += 1
        break
      case 'skipped':
        counts.skipped += 1
        break
      default:
        counts.other += 1
    }
  }
  const done = counts.success + counts.failure + counts.skipped + counts.other
  const active = counts.in_progress + counts.queued
  const total = stages.length || 1
  const progressPct = Math.round(((done + active * 0.5) / total) * 100)
  return { counts, progressPct, done, active, total: stages.length }
}

function ProgressRing({ percent }) {
  const size = 72
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <div className="relative inline-flex h-[72px] w-[72px] items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2563eb"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-sm font-bold text-slate-900">{percent}%</span>
    </div>
  )
}

function DurationChart({ stages }) {
  const durations = stages.map(stage => ({
    key: stage.key,
    name: stage.name,
    ms: stageDurationMs(stage),
    status: statusKey(stage.conclusion || stage.status),
  }))
  const maxMs = Math.max(1, ...durations.map(d => d.ms || 0))
  const hasAny = durations.some(d => d.ms !== null)

  if (!hasAny) return null

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
      data-testid="pipeline-duration-chart"
    >
      <h4 className="mb-3 text-sm font-semibold text-slate-800">How long each step took</h4>
      <ul className="space-y-2.5">
        {durations.map(item => {
          const width = item.ms === null ? 0 : Math.max(4, Math.round((item.ms / maxMs) * 100))
          return (
            <li
              key={item.key}
              className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-xs"
            >
              <span className="truncate font-medium text-slate-700" title={item.name}>
                {item.name}
              </span>
              <div className="h-2.5 overflow-hidden rounded-full bg-white border border-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${BAR_STYLES.get(item.status)}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right tabular-nums text-slate-500">
                {formatDuration(item.ms) || '—'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TimelineTrack({ stages }) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4"
      data-testid="pipeline-timeline"
    >
      <h4 className="mb-4 text-sm font-semibold text-slate-800">Step timeline</h4>
      <ol className="relative space-y-0">
        {stages.map((stage, index) => {
          const conclusion = stage.conclusion || stage.status
          const key = statusKey(conclusion)
          const duration = formatDuration(stageDurationMs(stage))
          const isLast = index === stages.length - 1
          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast ? (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-0.75rem)] w-0.5 ${connectorClass(conclusion)}`}
                  aria-hidden
                />
              ) : null}
              <span
                className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${DOT_STYLES.get(key)}`}
              >
                {ICONS.get(key)}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{stage.name}</p>
                  <StatusBadge status={conclusion} />
                  {duration ? (
                    <span className="text-xs tabular-nums text-slate-500">{duration}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Step {index + 1} of {stages.length}
                  {stage.jobs?.length
                    ? ` · ${stage.jobs.length} job${stage.jobs.length === 1 ? '' : 's'}`
                    : ' · no jobs yet'}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * Horizontal CI/CD stage visualization with progress, duration, and timeline views.
 */
function PipelineFlow({ stages = [], title = 'Release steps' }) {
  if (!stages.length) {
    return <p className="text-sm text-slate-500">No steps to show yet.</p>
  }

  const summary = summarizeStages(stages)

  return (
    <div className="space-y-5" data-testid="pipeline-flow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {summary.done} finished · {summary.active} in progress · {summary.total} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ProgressRing percent={summary.progressPct} />
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              [
                'Passed',
                summary.counts.success,
                'bg-emerald-50 text-emerald-800 border-emerald-200',
              ],
              [
                'Needs attention',
                summary.counts.failure,
                'bg-rose-50 text-rose-800 border-rose-200',
              ],
              [
                'Running',
                summary.counts.in_progress + summary.counts.queued,
                'bg-sky-50 text-sky-800 border-sky-200',
              ],
              ['Skipped', summary.counts.skipped, 'bg-slate-100 text-slate-600 border-slate-200'],
            ].map(([label, count, style]) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold ${style}`}
              >
                {count} {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        data-testid="pipeline-progress-bar"
      >
        <div className="flex h-full w-full">
          {stages.map(stage => {
            const key = statusKey(stage.conclusion || stage.status)
            return (
              <div
                key={stage.key}
                className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${BAR_STYLES.get(key)} ${
                  key === 'skipped' ? 'opacity-40' : ''
                }`}
                title={`${stage.name}: ${key}`}
              />
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-max items-stretch gap-0">
          {stages.map((stage, index) => {
            const conclusion = stage.conclusion || stage.status
            const key = statusKey(conclusion)
            const nodeStyle = NODE_STYLES.get(key)
            const next = stages[index + 1]
            const duration = formatDuration(stageDurationMs(stage))
            return (
              <li key={stage.key} className="flex items-center">
                <div
                  className={`w-44 rounded-2xl border px-3 py-3 shadow-sm ${nodeStyle}`}
                  title={stage.name}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Step {index + 1}
                    </p>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${DOT_STYLES.get(key)}`}
                    >
                      {ICONS.get(key)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                    {stage.name}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={conclusion} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {stage.jobs?.length
                        ? `${stage.jobs.length} job${stage.jobs.length === 1 ? '' : 's'}`
                        : 'No jobs'}
                    </span>
                    <span className="tabular-nums font-medium">{duration || '—'}</span>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <DurationChart stages={stages} />
        <TimelineTrack stages={stages} />
      </div>
    </div>
  )
}

export default PipelineFlow
