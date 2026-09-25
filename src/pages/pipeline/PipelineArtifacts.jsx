import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SetupBanner from '@components/pipeline/SetupBanner'
import LoadingSpinner from '@components/LoadingSpinner'
import {
  getPipelineErrorMeta,
  usePipelineOverview,
  usePipelineStatus,
  useRecentArtifacts,
} from '@hooks/usePipelines'
import { PAGE_TITLES, TEST_IDS, pipelineRunPath } from '../../config/app-contract'

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function friendlyArtifactName(name) {
  const map = new Map([
    ['web-coverage', 'Test coverage report'],
    ['playwright-report', 'Browser test report'],
    ['web-dist', 'Website build files'],
    ['release-bundle', 'Release package'],
    ['cd-release', 'Deploy package'],
  ])
  return map.get(name) || name
}

function PipelineArtifacts() {
  const statusQuery = usePipelineStatus()
  const configured = statusQuery.data?.configured === true
  const overview = usePipelineOverview({ enabled: configured })
  const artifactsQuery = useRecentArtifacts(overview.data?.recentRuns || [])
  const errorMeta = getPipelineErrorMeta(overview.error || artifactsQuery.error)
  const isLoading =
    statusQuery.isLoading || (configured && (overview.isLoading || artifactsQuery.isLoading))

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.pipelineArtifacts}</title>
      </Helmet>

      <div className="space-y-4" data-testid={TEST_IDS.pipelineArtifactsPage}>
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

        {!errorMeta && !isLoading ? (
          <div className="card">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Recent reports</h2>
            <p className="mb-4 text-sm text-slate-600">
              These are files saved from recent builds — such as test reports. Open the related run
              on GitHub to download them.
            </p>
            {(artifactsQuery.data || []).length ? (
              <ul className="space-y-2">
                {artifactsQuery.data.map(artifact => (
                  <li
                    key={`${artifact.runId}-${artifact.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {friendlyArtifactName(artifact.name)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {artifact.name} · {formatBytes(artifact.sizeInBytes)}
                        {artifact.expired ? ' · expired' : ''}
                      </p>
                    </div>
                    <Link
                      to={pipelineRunPath(artifact.runId)}
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      Related run
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No reports found yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}

export default PipelineArtifacts
