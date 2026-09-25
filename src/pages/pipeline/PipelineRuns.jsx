import { useState } from 'react'
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

function PipelineRuns() {
  const [workflow, setWorkflow] = useState('')
  const statusQuery = usePipelineStatus()
  const configured = statusQuery.data?.configured === true
  const { data, isLoading, error } = usePipelineRuns({
    workflow: workflow || undefined,
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
          <SetupBanner
            message="Pipeline monitor is not configured"
            hint={statusQuery.data?.hint}
          />
        ) : null}

        {errorMeta?.type === 'setup' ? (
          <SetupBanner message={errorMeta.message} hint={errorMeta.hint} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="workflow-filter" className="text-sm font-semibold text-slate-700">
            Show
          </label>
          <select
            id="workflow-filter"
            value={workflow}
            onChange={event => setWorkflow(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
          >
            <option value="">Everything</option>
            <option value="ci">Builds & checks only</option>
            <option value="cd">Releases only</option>
          </select>
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
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.runs?.length ? (
              <p className="px-4 py-6 text-sm text-slate-500">No history to show yet.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}

export default PipelineRuns
