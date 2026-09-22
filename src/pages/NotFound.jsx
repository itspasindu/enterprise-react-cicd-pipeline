import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { ARIA, TEST_IDS, PAGE_TITLES } from '../config/app-contract'

function NotFound() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.notFound}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div
        className="min-h-[60vh] flex items-center justify-center"
        data-testid={TEST_IDS.notFoundPage}
      >
        <div className="text-center card max-w-md">
          <h1 className="text-7xl font-bold text-slate-200 mb-2">404</h1>
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">Page not found</h2>
          <p className="text-slate-600 mb-6">
            That page does not exist. Try going back to the home page.
          </p>
          <Link
            to="/"
            className="btn-primary"
            data-testid={TEST_IDS.goHomeLink}
            aria-label={ARIA.goHome}
          >
            {ARIA.goHome}
          </Link>
        </div>
      </div>
    </>
  )
}

export default NotFound
