import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { ARIA, TEST_IDS, PAGE_TITLES, ROUTES } from '../config/app-contract'

function NotFound() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.notFound}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div
        className="min-h-[60vh] flex items-center justify-center animate-rise"
        data-testid={TEST_IDS.notFoundPage}
      >
        <div className="text-center card max-w-md shadow-lift">
          <p className="text-7xl font-extrabold text-slate-100 mb-1 select-none">404</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Page not found</h1>
          <p className="text-slate-600 mb-7 leading-relaxed">
            That page does not exist. Try going back home or checking delivery status.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="btn-primary"
              data-testid={TEST_IDS.goHomeLink}
              aria-label={ARIA.goHome}
            >
              {ARIA.goHome}
            </Link>
            <Link to={ROUTES.pipeline} className="btn-secondary">
              Check status
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

export default NotFound
