import { Helmet } from 'react-helmet-async'
import StatusBadge from '@components/pipeline/StatusBadge'
import LoadingSpinner from '@components/LoadingSpinner'
import { useStagingHealth } from '@hooks/usePipelines'
import { PAGE_TITLES, TEST_IDS } from '../../config/app-contract'

const PATH_LABELS = new Map([
  ['/', 'Home page'],
  ['/about', 'About page'],
  ['/contact', 'Contact page'],
  ['/api/health', 'Service is up'],
  ['/api/ready', 'Service is ready'],
])

function PipelineStaging() {
  const { data, isLoading, error, refetch, isFetching } = useStagingHealth()

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineStaging}</title>
      </Helmet>

      <div className="space-y-4" data-testid={TEST_IDS.pipelineStagingPage}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600 max-w-xl">
            Quick checks that important pages and services respond. Passed means the site looks
            reachable.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={isFetching}
          >
            {isFetching ? 'Checking…' : 'Check again'}
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error.message || 'Could not check the website right now'}
          </div>
        ) : null}

        {isLoading ? <LoadingSpinner /> : null}

        {data ? (
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={data.healthy ? 'success' : 'failure'} />
              <span className="text-sm font-medium text-slate-800">
                {data.healthy ? 'All checks look good' : 'Something needs attention'}
              </span>
            </div>

            <ul className="space-y-2">
              {(data.checks || []).map(check => (
                <li
                  key={check.path}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {PATH_LABELS.get(check.path) || check.path}
                    </p>
                    <p className="text-xs text-slate-500">
                      {check.ok ? 'Responded' : 'Did not respond'} · {check.latencyMs}ms
                      {check.error ? ` · ${check.error}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={check.ok ? 'success' : 'failure'} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Checked at {new Date(data.checkedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

export default PipelineStaging
