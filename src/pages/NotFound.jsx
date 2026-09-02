import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { ARIA, TEST_IDS } from '../config/app-contract'

function NotFound() {
  return (
    <>
      <Helmet>
        <title>404 | Page Not Found</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-[60vh] flex items-center justify-center" data-testid={TEST_IDS.notFoundPage}>
        <div className="text-center">
          <h1 className="text-9xl font-bold text-slate-700 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-slate-300 mb-4">Page Not Found</h2>
          <p className="text-slate-400 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link to="/" className="btn-primary" data-testid={TEST_IDS.goHomeLink} aria-label={ARIA.goHome}>
            {ARIA.goHome}
          </Link>
        </div>
      </div>
    </>
  )
}

export default NotFound
