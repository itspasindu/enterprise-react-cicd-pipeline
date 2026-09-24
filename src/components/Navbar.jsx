import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { APP_NAME, NAV_LINKS, ROUTES, TEST_IDS, ARIA } from '../config/app-contract'

function isNavActive(pathname, path) {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

function Navbar() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl"
      data-testid={TEST_IDS.mainNav}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-[4.25rem]">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-sm font-extrabold text-white shadow-sm shadow-blue-600/30 transition-transform duration-200 group-hover:scale-105">
              DS
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
              {APP_NAME}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 rounded-full bg-slate-100/80 p-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-pill ${
                  isNavActive(location.pathname, link.path) ? 'nav-pill-active' : 'nav-pill-idle'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:block">
            <Link to={ROUTES.pipeline} className="btn-primary !px-4 !py-2 text-sm">
              Check status
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors"
            aria-label={ARIA.toggleMenu}
            data-testid={TEST_IDS.mobileMenuToggle}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-1 animate-fade">
            {NAV_LINKS.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isNavActive(location.pathname, link.path)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to={ROUTES.pipeline}
              onClick={() => setMobileOpen(false)}
              className="btn-primary w-full mt-2 text-sm"
            >
              Check status
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar
