import { Helmet } from 'react-helmet-async'
import SetupBanner from '@components/pipeline/SetupBanner'
import LoadingSpinner from '@components/LoadingSpinner'
import { getPipelineErrorMeta, usePipelineFailures, usePipelineStatus } from '@hooks/usePipelines'
import { PAGE_TITLES, TEST_IDS } from '../../config/app-contract'

function timeAgo(iso) {
  if (!iso) return ''
  const delta = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function PipelineFailures() {
  const statusQuery = usePipelineStatus()
  const configured = statusQuery.data?.configured === true
  const { data, isLoading, error } = usePipelineFailures({ enabled: configured })
  const errorMeta = getPipelineErrorMeta(error)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineFailures}</title>
      </Helmet>

      <div className="space-y-4" data-testid={TEST_IDS.pipelineFailuresPage}>
        {!configured && !statusQuery.isLoading ? (
          <SetupBanner
            message="Pipeline monitor is not configured"
            hint={statusQuery.data?.hint}
          />
        ) : null}

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
          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Open problems</h2>
                <p className="text-sm text-slate-600">
                  Issues created when a build or release needs attention.
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-500">{data.count} open</span>
            </div>
            {(data.failures || []).length ? (
              <ul className="space-y-3">
                {data.failures.map(issue => (
                  <li
                    key={issue.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <a
                      href={issue.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      #{issue.number} {issue.title}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {timeAgo(issue.updatedAt)} · {issue.author || 'unknown'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(issue.labels || []).map(label => (
                        <span
                          key={label}
                          className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700 font-medium">
                No open problems — everything looks clear.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}

export default PipelineFailures
