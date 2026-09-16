import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { TEST_IDS, PAGE_TITLES } from '../config/app-contract'

function Home() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.home}</title>
        <meta
          name="description"
          content="A full-stack application delivered through a secure container pipeline"
        />
      </Helmet>

      <div className="space-y-12" data-testid={TEST_IDS.homePage}>
        {/* Hero Section */}
        <section className="text-center py-16">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-gradient">
            Full-Stack Delivery Platform
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            React, Node.js, and PostgreSQL released through secure, reusable GitHub Actions
            workflows.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/about" className="btn-primary">
              Learn More
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* Features Grid */}
        <section className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: 'Full-Stack Testing',
              desc: 'Web, API, database integration, and Playwright tests run before release.',
              icon: '⚡',
            },
            {
              title: 'Security Gates',
              desc: 'Dependency, secret, source, filesystem, and container vulnerability scans.',
              icon: '🛡️',
            },
            {
              title: 'Immutable Releases',
              desc: 'CalVer image tags, SBOMs, provenance, and digest-based deployment.',
              icon: '🚀',
            },
            {
              title: 'Node.js API',
              desc: 'Validated contact requests, security headers, rate limits, and health routes.',
              icon: '🔒',
            },
            {
              title: 'PostgreSQL',
              desc: 'Persistent application data with forward-only, tracked SQL migrations.',
              icon: '🧪',
            },
            {
              title: 'Safe Deployment',
              desc: 'Docker Compose health waits and automatic web/API rollback on failure.',
              icon: '📊',
            },
          ].map(feature => (
            <div key={feature.title} className="card hover:border-blue-500/50 transition-colors">
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm">{feature.desc}</p>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="text-2xl font-bold mb-6">Request Path</h2>
          <div className="grid gap-4 md:grid-cols-4 text-center">
            {[
              ['Browser', 'Public entry point'],
              ['Web', 'React + nginx'],
              ['API', 'Node.js + Express'],
              ['Database', 'PostgreSQL'],
            ].map(([name, detail], index) => (
              <div key={name} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Step {index + 1}
                </span>
                <h3 className="mt-2 font-semibold">{name}</h3>
                <p className="mt-1 text-sm text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="text-2xl font-bold mb-6">Delivery Components</h2>
          <div className="flex flex-wrap gap-3">
            {[
              'React',
              'Vite',
              'Node.js',
              'Express',
              'PostgreSQL',
              'Docker Compose',
              'GitHub Actions',
              'Vitest',
              'Playwright',
              'Trivy',
            ].map(tech => (
              <span
                key={tech}
                className="px-4 py-2 bg-slate-700/50 rounded-full text-sm font-medium text-slate-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default Home
