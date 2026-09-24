import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { TEST_IDS, PAGE_TITLES, ROUTES } from '../config/app-contract'

function About() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.about}</title>
        <meta name="description" content="How this delivery status dashboard works" />
      </Helmet>

      <div className="max-w-3xl mx-auto space-y-6 animate-rise" data-testid={TEST_IDS.aboutPage}>
        <div className="soft-panel px-6 py-8 md:px-8">
          <p className="section-label mb-2">About</p>
          <h1 className="page-title">How this works</h1>
          <p className="page-subtitle mt-3">
            This site helps everyone — not just engineers — see whether a software release is
            healthy.
          </p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-xl font-bold text-slate-900">What you can check</h2>
          <p className="text-slate-600 leading-relaxed">
            Open <strong className="text-slate-800">Status</strong> to see the latest build and
            release results. Green means things look good. Red means something needs attention.
            Yellow or blue means work is still in progress.
          </p>
          <Link to={ROUTES.pipeline} className="btn-primary !px-4 !py-2 text-sm w-fit">
            Go to status board →
          </Link>
        </div>

        <div className="card space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Built-in safety</h2>
          <ul className="space-y-3">
            {[
              'Automatic tests run before a release can go out',
              'Security scans look for known risks',
              'If a deploy fails, the previous working version is put back',
              'Open problems are listed so the team can follow up',
            ].map(item => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-slate-700"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Behind the scenes</h2>
          <p className="text-slate-600 leading-relaxed">
            The website talks to a small service that stores contact messages and reads delivery
            status from GitHub Actions. You do not need to know those details to use the status
            board — just look for Passed, Running, or Needs attention.
          </p>
        </div>
      </div>
    </>
  )
}

export default About
