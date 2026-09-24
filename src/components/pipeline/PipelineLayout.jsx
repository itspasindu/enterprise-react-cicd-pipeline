import { NavLink, Outlet } from 'react-router-dom'
import LiveStatusBar from './LiveStatusBar'
import SetupBanner from './SetupBanner'
import { getPipelineErrorMeta, usePipelineStatus } from '@hooks/usePipelines'
import { PIPELINE_NAV, TEST_IDS } from '../../config/app-contract'

function PipelineLayout() {
  const {
    data: status,
    error: statusError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = usePipelineStatus()
  const statusSetupError = getPipelineErrorMeta(statusError)
  const needsSetup = status?.configured === false || statusSetupError?.type === 'setup'

  return (
    <div className="space-y-6 animate-rise">
      <div className="soft-panel px-6 py-7 md:px-8">
        <p className="section-label mb-2">Live board</p>
        <h1 className="page-title">Delivery status</h1>
        <p className="page-subtitle mt-2 max-w-2xl">
          A simple view of the latest builds, releases, and website health. Green is good. Red needs
          attention.
        </p>
      </div>

      <LiveStatusBar
        live={Boolean(status?.live)}
        isFetching={isFetching}
        updatedAt={dataUpdatedAt || undefined}
        onRefresh={() => refetch()}
        owner={status?.owner}
        repo={status?.repo}
      />

      {needsSetup ? (
        <SetupBanner
          message={statusSetupError?.message || 'Live status is not connected yet'}
          hint={status?.hint || statusSetupError?.hint}
        />
      ) : null}

      <nav
        className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-sm backdrop-blur-sm"
        data-testid={TEST_IDS.pipelineSubnav}
        aria-label="Status sections"
      >
        {PIPELINE_NAV.map(link => (
          <NavLink
            key={link.path}
            to={link.path}
            end={Boolean(link.end)}
            className={({ isActive }) =>
              `rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

export default PipelineLayout
