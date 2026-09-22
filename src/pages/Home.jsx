import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { TEST_IDS, PAGE_TITLES, ROUTES } from '../config/app-contract'

function Home() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.home}</title>
        <meta
          name="description"
          content="Check whether software builds and releases are healthy — no technical jargon required."
        />
      </Helmet>

      <div className="space-y-12" data-testid={TEST_IDS.homePage}>
        <section className="text-center py-12 md:py-16 rounded-3xl bg-gradient-to-b from-blue-50 to-slate-50 border border-slate-200 px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700 mb-3">
            Simple delivery dashboard
          </p>
          <h1 className="text-4xl md:text-6xl font-bold mb-5 text-slate-900 tracking-tight">
            Is the release healthy?
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            See build results, safety checks, and website health in plain language — so anyone on
            the team can understand what is going on.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to={ROUTES.pipeline} className="btn-primary">
              Check status now
            </Link>
            <Link to="/about" className="btn-secondary">
              How it works
            </Link>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-5">
          {[
            {
              title: 'Automated checks',
              desc: 'Tests run automatically before anything is released to users.',
              icon: '✓',
            },
            {
              title: 'Safety first',
              desc: 'Security scans look for known risks before a release can continue.',
              icon: '🛡',
            },
            {
              title: 'Safe rollouts',
              desc: 'If something goes wrong during deploy, the previous version is restored.',
              icon: '↩',
            },
            {
              title: 'Clear history',
              desc: 'Browse past builds and see what passed, failed, or is still running.',
              icon: '⏱',
            },
            {
              title: 'Problem tickets',
              desc: 'When something fails, open issues are listed so the team can fix them.',
              icon: '!',
            },
            {
              title: 'Live website pulse',
              desc: 'Quick checks show whether the staging site is responding as expected.',
              icon: '♥',
            },
          ].map(feature => (
            <div key={feature.title} className="card hover:border-blue-200 transition-colors">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 font-bold">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2 text-slate-900">{feature.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="text-xl font-bold mb-2 text-slate-900">What happens when you visit</h2>
          <p className="muted mb-6 text-sm">A simple path from your browser to saved data.</p>
          <div className="grid gap-4 md:grid-cols-4 text-center">
            {[
              ['You', 'Open the website'],
              ['Website', 'Shows pages and forms'],
              ['Service', 'Handles your request'],
              ['Database', 'Stores messages safely'],
            ].map(([name, detail], index) => (
              <div key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Step {index + 1}
                </span>
                <h3 className="mt-2 font-semibold text-slate-900">{name}</h3>
                <p className="mt-1 text-sm text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default Home
