import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { TEST_IDS } from '../config/app-contract'

function Home() {
  return (
    <>
      <Helmet>
        <title>Home | Enterprise React App</title>
        <meta name="description" content="Welcome to our enterprise-grade React application" />
      </Helmet>

      <div className="space-y-12" data-testid={TEST_IDS.homePage}>
        {/* Hero Section */}
        <section className="text-center py-16">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-gradient">React Version 2</h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">enterprise-grade CI/CD</p>
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
              title: 'CI/CD Pipeline',
              desc: 'Automated testing, security scanning, and deployment with GitHub Actions.',
              icon: '⚡',
            },
            {
              title: 'Security First',
              desc: 'CSP headers, dependency auditing, and SAST security analysis.',
              icon: '🛡️',
            },
            {
              title: 'Performance',
              desc: 'Code splitting, lazy loading, PWA support, and optimized builds.',
              icon: '🚀',
            },
            {
              title: 'Type Safety',
              desc: 'Full TypeScript support with strict type checking.',
              icon: '🔒',
            },
            {
              title: 'Testing',
              desc: 'Unit tests with Vitest, E2E with Playwright, and visual regression.',
              icon: '🧪',
            },
            {
              title: 'Monitoring',
              desc: 'Health checks, error tracking, and performance monitoring.',
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

        {/* Tech Stack */}
        <section className="card">
          <h2 className="text-2xl font-bold mb-6">Technology Stack</h2>
          <div className="flex flex-wrap gap-3">
            {[
              'React 18',
              'Vite',
              'Tailwind CSS',
              'React Router',
              'Zustand',
              'React Query',
              'Vitest',
              'Playwright',
              'AWS EC2',
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
