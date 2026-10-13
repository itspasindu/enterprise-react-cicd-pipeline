import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import StageBoard from '@components/pipeline/StageBoard'
import PipelineFlow from '@components/pipeline/PipelineFlow'
import RunSummaryCard from '@components/pipeline/RunSummaryCard'
import StatusBadge from '@components/pipeline/StatusBadge'
import ReleaseIdentityCard from '@components/pipeline/ReleaseIdentityCard'
import DeployTimeline from '@components/pipeline/DeployTimeline'
import LoadingSpinner from '@components/LoadingSpinner'
import { getPipelineErrorMeta, usePipelineOverview, usePipelineStatus } from '@hooks/usePipelines'
import {
  PAGE_TITLES,
  ROUTES,
  TEST_IDS,
  pipelineFailurePath,
  pipelineRunPath,
} from '../../config/app-contract'

function PipelineOverview() {
  const statusQuery = usePipelineStatus()
  const configured = statusQuery.data?.configured === true
  const { data, isLoading, error, isFetching, refetch, dataUpdatedAt } = usePipelineOverview({
    enabled: configured,
  })
  const errorMeta = getPipelineErrorMeta(error)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipeline}</title>
      </Helmet>

      <div className="space-y-6" data-testid={TEST_IDS.pipelinePage}>
        {!configured && !statusQuery.isLoading ? (
          <p className="text-sm text-slate-600">
            Connect the API to GitHub to load live build and release results here.
            {statusQuery.data?.hint ? ` ${statusQuery.data.hint}` : ''}
          </p>
        ) : null}

        {statusQuery.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-semibold">The status service is temporarily unavailable</p>
            <p className="mt-1 text-rose-700/90">
              Start the API with npm run api:dev (port 3001), then refresh.
            </p>
          </div>
        ) : null}

        {errorMeta?.type === 'error' || errorMeta?.type === 'unavailable' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-semibold">{errorMeta.message}</p>
            {errorMeta.hint ? <p className="mt-1 text-rose-700/90">{errorMeta.hint}</p> : null}
          </div>
        ) : null}

        {isLoading ? <LoadingSpinner /> : null}

        {data ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Updates automatically
                {dataUpdatedAt
                  ? ` · last checked ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                  : ''}
                {data.staging?.baseUrl ? (
                  <>
                    {' '}
                    · probing{' '}
                    <code className="rounded bg-slate-100 px-1 text-slate-700">
                      {data.staging.baseUrl}
                    </code>
                  </>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                disabled={isFetching}
              >
                {isFetching ? 'Updating…' : 'Refresh'}
              </button>
            </div>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="metric-card">
                <p className="section-label">Latest build</p>
                <div className="mt-3">
                  <StatusBadge status={data.latestCi?.conclusion || 'skipped'} />
                </div>
              </div>
              <div className="metric-card">
                <p className="section-label">Latest release</p>
                <div className="mt-3">
                  <StatusBadge status={data.latestCd?.conclusion || 'skipped'} />
                </div>
              </div>
              <div className="metric-card">
                <p className="section-label">Open problems</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
                  {data.openFailureCount}
                </p>
                <Link
                  to={ROUTES.pipelineFailures}
                  className="mt-2 inline-block text-sm font-bold text-blue-700 hover:underline"
                >
                  View problems
                </Link>
              </div>
              <div className="metric-card">
                <p className="section-label">Live website</p>
                <div className="mt-3">
                  <StatusBadge status={data.staging?.ready ? 'success' : 'failure'} />
                </div>
                <Link
                  to={ROUTES.pipelineStaging}
                  className="mt-2 inline-block text-sm font-bold text-blue-700 hover:underline"
                >
                  Check website
                </Link>
              </div>
            </section>

            <section className="card">
              <ReleaseIdentityCard release={data.release} />
            </section>

            <section className="card">
              <PipelineFlow stages={data.stages} title="Where things stand right now" />
            </section>

            {(data.deployTimeline || []).length ? (
              <section className="card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Deploy timeline</h2>
                <DeployTimeline steps={data.deployTimeline} />
              </section>
            ) : null}

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Latest build & checks</h2>
                <RunSummaryCard run={data.latestCi} />
              </div>
              <div className="card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Latest release</h2>
                <RunSummaryCard run={data.latestCd} />
              </div>
            </section>

            {(data.recentFailures || []).length ? (
              <section className="card">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Open problems</h2>
                  <Link
                    to={ROUTES.pipelineFailures}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    See all
                  </Link>
                </div>
                <ul className="space-y-2">
                  {data.recentFailures.map(issue => (
                    <li
                      key={issue.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        to={pipelineFailurePath(issue.number)}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        #{issue.number} {issue.title}
                      </Link>
                      <span className="text-xs text-slate-500">{issue.author || 'unknown'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="card">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Step-by-step details</h2>
              </div>
              <StageBoard stages={data.stages} />
            </section>

            <section className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
                <Link
                  to={ROUTES.pipelineRuns}
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  See full history
                </Link>
              </div>
              <ul className="divide-y divide-slate-100">
                {(data.recentRuns || []).map(run => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <Link
                        to={pipelineRunPath(run.id)}
                        className="font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {run.displayTitle || run.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {run.workflow === 'ci'
                          ? 'Build'
                          : run.workflow === 'cd'
                            ? 'Release'
                            : 'Run'}{' '}
                        · {run.branch}
                        {run.htmlUrl ? (
                          <>
                            {' '}
                            ·{' '}
                            <a
                              href={run.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              GitHub
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <StatusBadge status={run.conclusion || run.status} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </>
  )
}

export default PipelineOverview
