import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SetupBanner from '@components/pipeline/SetupBanner'
import StatusBadge from '@components/pipeline/StatusBadge'
import LoadingSpinner from '@components/LoadingSpinner'
import { getPipelineErrorMeta, usePipelineRuns, usePipelineStatus } from '@hooks/usePipelines'
import { PAGE_TITLES, TEST_IDS, pipelineRunPath } from '../../config/app-contract'

function formatWhen(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function sinceFromRange(range) {
  if (!range || range === 'all') return undefined
  const days = Number(range)
  if (!Number.isFinite(days) || days <= 0) return undefined
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString()
}

function PipelineRuns() {
  const [workflow, setWorkflow] = useState('')
  const [branch, setBranch] = useState('')
  const [actor, setActor] = useState('')
  const [status, setStatus] = useState('')
  const [range, setRange] = useState('all')
  const since = useMemo(() => sinceFromRange(range), [range])
  const statusQuery = usePipelineStatus()
  const configured = statusQuery.data?.configured === true
  const { data, isLoading, error } = usePipelineRuns({
    workflow: workflow || undefined,
    branch: branch.trim() || undefined,
    actor: actor.trim() || undefined,
    status: status || undefined,
    since,
    enabled: configured,
  })
  const errorMeta = getPipelineErrorMeta(error)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineRuns}</title>
      </Helmet>

      <div className="space-y-4" data-testid={TEST_IDS.pipelineRunsPage}>
        {!configured && !statusQuery.isLoading ? (
          <SetupBanner message="Pipeline monitor is not configured" hint={statusQuery.data?.hint} />
        ) : null}

        {errorMeta?.type === 'setup' ? (
          <SetupBanner message={errorMeta.message} hint={errorMeta.hint} />
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Show</span>
            <select
              value={workflow}
              onChange={event => setWorkflow(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            >
              <option value="">Everything</option>
              <option value="ci">Builds & checks only</option>
              <option value="cd">Releases only</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Result</span>
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            >
              <option value="">Any</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="cancelled">Cancelled</option>
              <option value="in_progress">In progress</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">When</span>
            <select
              value={range}
              onChange={event => setRange(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            >
              <option value="all">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Branch</span>
            <input
              type="text"
              value={branch}
              onChange={event => setBranch(event.target.value)}
              placeholder="main"
              className="w-36 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Started by</span>
            <input
              type="text"
              value={actor}
              onChange={event => setActor(event.target.value)}
              placeholder="username"
              className="w-36 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
            />
          </label>
        </div>

        {isLoading ? <LoadingSpinner /> : null}

        {errorMeta?.type === 'error' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMeta.message}
          </div>
        ) : null}

        {data ? (
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">What happened</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Started by</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.runs || []).map(run => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={pipelineRunPath(run.id)}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {run.displayTitle || run.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {run.workflow === 'ci' ? 'Build' : run.workflow === 'cd' ? 'Release' : 'Run'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.conclusion || run.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{run.branch}</td>
                    <td className="px-4 py-3 text-slate-700">{run.actor || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatWhen(run.runStartedAt || run.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {run.htmlUrl ? (
                        <a
                          href={run.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          GitHub
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.runs?.length ? (
              <p className="px-4 py-6 text-sm text-slate-500">No history matches these filters.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}

export default PipelineRuns
