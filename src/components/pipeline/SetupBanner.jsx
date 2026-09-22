import { TEST_IDS } from '../../config/app-contract'

function SetupBanner({ message, hint }) {
  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
      data-testid={TEST_IDS.pipelineSetupBanner}
      role="status"
    >
      <p className="font-semibold">{message || 'Live status is not connected yet'}</p>
      {hint ? <p className="mt-1 text-amber-900/80">{hint}</p> : null}
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-amber-950/90">
        <li>
          Copy <code className="rounded bg-white/80 px-1">.env.example</code> to{' '}
          <code className="rounded bg-white/80 px-1">.env</code>
        </li>
        <li>
          Add your GitHub token and repository name (
          <code className="rounded bg-white/80 px-1">GITHUB_TOKEN</code>,{' '}
          <code className="rounded bg-white/80 px-1">GITHUB_OWNER</code>,{' '}
          <code className="rounded bg-white/80 px-1">GITHUB_REPO</code>)
        </li>
        <li>Restart the API, then refresh this page</li>
      </ol>
    </div>
  )
}

export default SetupBanner
