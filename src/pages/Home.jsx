import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { TEST_IDS, PAGE_TITLES, ROUTES } from '../config/app-contract'

const FEATURES = [
  {
    title: 'Automated checks',
    desc: 'Tests run automatically before anything is released to users.',
    icon: '✓',
    tone: 'from-emerald-500 to-teal-500',
  },
  {
    title: 'Safety first',
    desc: 'Security scans look for known risks before a release can continue.',
    icon: '🛡',
    tone: 'from-blue-500 to-sky-500',
  },
  {
    title: 'Safe rollouts',
    desc: 'If something goes wrong during deploy, the previous version is restored.',
    icon: '↩',
    tone: 'from-teal-500 to-cyan-500',
  },
  {
    title: 'Clear history',
    desc: 'Browse past builds and see what passed, failed, or is still running.',
    icon: '⏱',
    tone: 'from-indigo-500 to-blue-500',
  },
  {
    title: 'Problem tickets',
    desc: 'When something fails, open issues are listed so the team can fix them.',
    icon: '!',
    tone: 'from-rose-500 to-orange-500',
  },
  {
    title: 'Live website pulse',
    desc: 'Quick checks show whether the staging site is responding as expected.',
    icon: '♥',
    tone: 'from-pink-500 to-rose-500',
  },
]

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

      <div className="space-y-14" data-testid={TEST_IDS.homePage}>
        <section className="relative overflow-hidden text-center py-14 md:py-20 rounded-[2rem] border border-slate-200/80 bg-white/80 px-6 shadow-soft animate-rise">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-blue-400/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 right-0 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl"
            aria-hidden
          />
          <p className="relative text-sm font-bold uppercase tracking-[0.14em] text-blue-700 mb-4">
            Simple delivery dashboard
          </p>
          <h1 className="relative text-4xl md:text-6xl font-extrabold mb-5 text-slate-900 tracking-tight leading-[1.08]">
            Is the release <span className="text-gradient">healthy?</span>
          </h1>
          <p className="relative text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-9 leading-relaxed">
            See build results, safety checks, and website health in plain language — so anyone on
            the team can understand what is going on.
          </p>
          <div className="relative flex gap-3 justify-center flex-wrap">
            <Link to={ROUTES.pipeline} className="btn-primary">
              Check status now
            </Link>
            <Link to="/about" className="btn-secondary">
              How it works
            </Link>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-5">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="card-interactive"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.tone} text-white text-lg font-bold shadow-sm`}
              >
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-2 text-slate-900">{feature.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="text-xl font-bold mb-2 text-slate-900">What happens when you visit</h2>
          <p className="muted mb-6 text-sm">A simple path from your browser to saved data.</p>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['You', 'Open the website'],
              ['Website', 'Shows pages and forms'],
              ['Service', 'Handles your request'],
              ['Database', 'Stores messages safely'],
            ].map(([name, detail], index) => (
              <div
                key={name}
                className="relative rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 text-center"
              >
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-bold text-slate-900">{name}</h3>
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
