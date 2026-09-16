import { Helmet } from 'react-helmet-async'
import { TEST_IDS, PAGE_TITLES } from '../config/app-contract'

function About() {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.about}</title>
        <meta name="description" content="Learn about the full-stack delivery architecture" />
      </Helmet>

      <div className="max-w-3xl mx-auto space-y-8" data-testid={TEST_IDS.aboutPage}>
        <h1 className="text-4xl font-bold text-gradient">About This Project</h1>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Architecture Overview</h2>
          <p className="text-slate-400 leading-relaxed">
            A non-root nginx container serves the React application and proxies API requests to a
            Node.js service. The API validates input and stores contact requests in PostgreSQL.
            Docker Compose connects the services while exposing only the web entry point.
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Security Measures</h2>
          <ul className="space-y-3 text-slate-400">
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Non-root, read-only application containers with dropped capabilities</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Separate web and API dependency vulnerability checks</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Blocking HIGH and CRITICAL container scans with Trivy</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>CodeQL analysis, secret scanning, SBOMs, and build provenance</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span>Immutable image digests used for deployment and rollback</span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">CI/CD Pipeline</h2>
          <p className="text-slate-400 leading-relaxed">
            Pull requests run web and API quality checks, PostgreSQL integration tests, full-stack
            browser tests, and security scans. Main-branch releases produce CalVer web and API
            images. Staging deploys those exact digests through Docker Compose, waits for service
            health, and automatically restores the previous application images when rollout fails.
          </p>
        </div>
      </div>
    </>
  )
}

export default About
