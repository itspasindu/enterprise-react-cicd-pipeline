import { NavLink, Outlet } from 'react-router-dom'
import LiveStatusBar from './LiveStatusBar'
import { usePipelineStatus } from '@hooks/usePipelines'
import { PIPELINE_NAV, TEST_IDS } from '../../config/app-contract'

function PipelineLayout() {
  const { data: status, isFetching, dataUpdatedAt, refetch } = usePipelineStatus()

  return (
    <div className="space-y-6">
      <div>
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

      <nav
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        data-testid={TEST_IDS.pipelineSubnav}
        aria-label="Status sections"
      >
        {PIPELINE_NAV.map(link => (
          <NavLink
            key={link.path}
            to={link.path}
            end={Boolean(link.end)}
            className={({ isActive }) =>
              `rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
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
