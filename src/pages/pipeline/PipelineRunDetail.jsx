import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SetupBanner from '@components/pipeline/SetupBanner'
import StageBoard from '@components/pipeline/StageBoard'
import PipelineFlow from '@components/pipeline/PipelineFlow'
import StatusBadge from '@components/pipeline/StatusBadge'
import LoadingSpinner from '@components/LoadingSpinner'
import { getPipelineErrorMeta, usePipelineRun } from '@hooks/usePipelines'
import { PAGE_TITLES, ROUTES, TEST_IDS } from '../../config/app-contract'

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PipelineRunDetail() {
  const { runId } = useParams()
  const { data, isLoading, error } = usePipelineRun(runId)
  const errorMeta = getPipelineErrorMeta(error)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineRunDetail}</title>
      </Helmet>

      <div className="space-y-6" data-testid={TEST_IDS.pipelineRunDetailPage}>
        <Link
          to={ROUTES.pipelineRuns}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Back to history
        </Link>

        {errorMeta?.type === 'setup' ? (
          <SetupBanner message={errorMeta.message} hint={errorMeta.hint} />
        ) : null}

        {errorMeta?.type === 'error' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMeta.message}
          </div>
        ) : null}

        {isLoading ? <LoadingSpinner /> : null}

        {data ? (
          <>
            <section className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {data.workflow === 'ci'
                    ? 'Build & checks'
                    : data.workflow === 'cd'
                      ? 'Release'
                      : 'Run'}
                </span>
                <StatusBadge status={data.conclusion || data.status} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {data.displayTitle || data.name}
              </h2>
              <p className="text-sm text-slate-600">
                Branch {data.branch} · started by {data.actor || 'unknown'}
              </p>
              {data.htmlUrl ? (
                <a
                  href={data.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Open on GitHub
                </a>
              ) : null}
            </section>

            <section className="card">
              <PipelineFlow stages={data.stages} title="Steps in this run" />
            </section>

            <section className="card">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Step details</h3>
              <StageBoard stages={data.stages} />
            </section>

            <section className="card overflow-x-auto">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Jobs</h3>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Job</th>
                    <th className="py-2 pr-4">Step</th>
                    <th className="py-2 pr-4">Result</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.jobs || []).map(job => (
                    <tr key={job.id}>
                      <td className="py-2 pr-4 text-slate-800">{job.name}</td>
                      <td className="py-2 pr-4 text-slate-500">{job.stageKey || '—'}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={job.conclusion || job.status} />
                      </td>
                      <td className="py-2">
                        {job.htmlUrl ? (
                          <a
                            href={job.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Saved reports</h3>
              {(data.artifacts || []).length ? (
                <ul className="space-y-2">
                  {data.artifacts.map(artifact => (
                    <li
                      key={artifact.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{artifact.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(artifact.sizeInBytes)}
                          {artifact.expired ? ' · expired' : ''}
                        </p>
                      </div>
                      {data.htmlUrl ? (
                        <a
                          href={data.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-blue-700 hover:underline"
                        >
                          Open on GitHub
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No saved reports for this run.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </>
  )
}

export default PipelineRunDetail
