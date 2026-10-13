import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SetupBanner from '@components/pipeline/SetupBanner'
import FailureReport from '@components/pipeline/FailureReport'
import LoadingSpinner from '@components/LoadingSpinner'
import { getPipelineErrorMeta, usePipelineFailure } from '@hooks/usePipelines'
import { PAGE_TITLES, ROUTES, TEST_IDS } from '../../config/app-contract'

function PipelineFailureDetail() {
  const { issueNumber } = useParams()
  const { data, isLoading, error } = usePipelineFailure(issueNumber)
  const errorMeta = getPipelineErrorMeta(error)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineFailureDetail}</title>
      </Helmet>

      <div className="space-y-6" data-testid={TEST_IDS.pipelineFailureDetailPage}>
        <Link
          to={ROUTES.pipelineFailures}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Back to problems
        </Link>

        {errorMeta?.type === 'setup' ? (
          <SetupBanner message={errorMeta.message} hint={errorMeta.hint} />
        ) : null}

        {errorMeta?.type === 'error' || errorMeta?.type === 'unavailable' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-semibold">{errorMeta.message}</p>
            {errorMeta.hint ? <p className="mt-1">{errorMeta.hint}</p> : null}
          </div>
        ) : null}

        {isLoading ? <LoadingSpinner /> : null}

        {data ? (
          <>
            <section className="card space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Problem #{data.number}
              </p>
              <h2 className="text-2xl font-bold text-slate-900">{data.title}</h2>
              <p className="text-sm text-slate-600">
                Opened by {data.author || 'unknown'}
                {data.updatedAt ? ` · updated ${new Date(data.updatedAt).toLocaleString()}` : ''}
              </p>
              <div className="flex flex-wrap gap-1">
                {(data.labels || []).map(label => (
                  <span
                    key={label}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
              {data.htmlUrl ? (
                <a
                  href={data.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Also on GitHub
                </a>
              ) : null}
            </section>

            <section className="card">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Failure report</h3>
              <FailureReport report={data.report} comments={data.comments || []} />
            </section>
          </>
        ) : null}
      </div>
    </>
  )
}

export default PipelineFailureDetail
