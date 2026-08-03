import { Helmet } from 'react-helmet-async'

function About() {
  return (
    <>
      <Helmet>
        <title>About | Enterprise React App</title>
        <meta name="description" content="Learn about our enterprise application architecture" />
      </Helmet>

      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-gradient">About This Project</h1>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Architecture Overview</h2>
          <p className="text-slate-400 leading-relaxed">
            This application follows modern React best practices with a focus on performance,
            security, and maintainability. It uses Vite for fast development and optimized
            production builds, with code splitting and lazy loading for optimal bundle sizes.
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Security Measures</h2>
          <ul className="space-y-3 text-slate-400">
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Content Security Policy (CSP) headers configured</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Dependency vulnerability scanning with npm audit</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Container image scanning with Trivy</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Static Application Security Testing (SAST)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Secrets detection and prevention</span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">CI/CD Pipeline</h2>
          <p className="text-slate-400 leading-relaxed">
            The pipeline includes automated linting, formatting checks, unit tests,
            integration tests, E2E tests, security scans, build verification, and
            automated deployment to staging and production environments with approval gates.
          </p>
        </div>
      </div>
    </>
  )
}

export default About
