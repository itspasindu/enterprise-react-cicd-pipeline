# 🚀 Enterprise React Application

A production-ready, enterprise-grade React application built with Vite, featuring a comprehensive CI/CD pipeline, security hardening, and automated deployment.

## 📁 Project Structure

```
enterprise-react-app/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── ci-failure.yml         # CI failure ticket template
│   └── workflows/
│       ├── enterprise-ci-cd.yml    # Full CI/CD pipeline
│       └── developer-fix-choice.yml # Developer picks auto vs manual fix
├── scripts/
│   ├── health-check.sh             # Comprehensive health check script
│   ├── deploy.sh                   # EC2 deployment and process automation
│   ├── create-failure-ticket.sh    # Opens GitHub Issues on CI failures
│   └── publish-wiki-report.sh      # Publishes final CI report to Wiki
├── src/
│   ├── components/                 # Reusable components
│   ├── pages/                      # Route pages
│   ├── hooks/                      # Custom React hooks
│   ├── utils/                      # Utility functions
│   ├── main.jsx                    # Application entry
│   ├── App.jsx                     # Root component
│   └── index.css                   # Global styles
├── tests/
│   ├── setup.js                    # Test configuration
│   ├── App.test.jsx                # Unit tests
│   └── e2e/
│       └── navigation.spec.js      # E2E tests
├── vite.config.js                  # Vite configuration
├── playwright.config.js            # E2E test configuration
├── tailwind.config.js              # Tailwind CSS config
├── .eslintrc.cjs                   # ESLint rules with security plugin
├── .prettierrc                     # Code formatting rules
├── tsconfig.json                   # TypeScript configuration
└── package.json                    # Dependencies & scripts
```

## 🛠️ Technology Stack

| Category      | Technology               |
| ------------- | ------------------------ |
| Framework     | React 18 + Vite          |
| Styling       | Tailwind CSS             |
| Routing       | React Router v6          |
| State         | Zustand                  |
| Data Fetching | React Query              |
| Testing       | Vitest + Playwright      |
| Linting       | ESLint + Prettier        |
| Runtime       | Node.js + PM2 on AWS EC2 |
| CI/CD         | GitHub Actions           |

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Development

```bash
# Clone repository
git clone <your-repo-url>
cd enterprise-react-app

# Install dependencies
npm ci

# Start development server
npm run dev

# Run tests
npm run test

# Run E2E tests
npm run test:e2e

# Build for production
npm run build

# Preview production build
npm run preview

# Start production server (used in EC2 deploy)
npm start
```

### EC2 Deployment

```bash
# On EC2: install dependencies and build
npm ci
npm run build

# Start app and keep it running
npm install -g pm2
pm2 start "npm run start" --name enterprise-react-app
pm2 save

# Run health checks
./scripts/health-check.sh http://localhost:4173
```

## 🔒 Security Features

| Feature                | Implementation                               |
| ---------------------- | -------------------------------------------- |
| CSP Headers            | Configured in app metadata and hosting layer |
| X-Frame-Options        | DENY                                         |
| X-Content-Type-Options | nosniff                                      |
| XSS Protection         | Enabled                                      |
| Referrer Policy        | strict-origin-when-cross-origin              |
| Permissions Policy     | Restricted                                   |
| Dependency Audit       | npm audit in CI                              |
| Secret Detection       | TruffleHog                                   |
| SAST                   | CodeQL Analysis                              |
| ESLint Security        | eslint-plugin-security                       |

## 🔄 CI/CD Pipeline

The pipeline runs only on **push to `main`** (including after a merge) plus manual `workflow_dispatch`. Pushes and PRs on other branches (e.g. `features/test`) do **not** start this pipeline.

```
1. Code Quality      → ESLint, Prettier, TypeScript checks
2. Security Scan     → npm audit, TruffleHog, CodeQL, Trivy
2.5 Fix Decision     → Developer chooses auto fix or manual fix (no silent auto-fix)
3. Unit Tests        → Vitest with coverage report artifact
4. Build once        → dist + SBOM + attested release bundle
5. E2E Tests         → Playwright against the exact build artifact
6. Deploy Staging    → Promote prebuilt dist to staging EC2 (no remote rebuild)
7. Failure Tickets   → Auto-create GitHub Issues when stages fail
8. Wiki Report       → Publish final pipeline report to GitHub Wiki
```

### Staging vs production

- **Staging:** deploys automatically on `main` after all gates pass (no manual approval).
- **Production:** server exists but is **not** deployed by this pipeline yet. Add a `production` environment + manual gate later when ready.

### Phase 1 — Security hardening

| Control | Implementation |
| --- | --- |
| Pin Actions to SHA | All `uses:` pinned to full commit SHAs (with version comments) |
| Least privilege | Workflow default `permissions: contents: read`; jobs elevate only when needed |
| No automatic `npm audit fix` | Audit **reports** only; dependency upgrades require a reviewed PR |
| Environment secrets | Deploy/build secrets on GitHub Environments (`ci`, `staging`) |
| Secure SSH | Pinned `STAGING_SSH_KNOWN_HOSTS` + `StrictHostKeyChecking=yes` (no live `ssh-keyscan`) |

### Phase 2 — Artifact (build once)

| Control | Implementation |
| --- | --- |
| Build once | Single `npm run build` on CI; staging uses `USE_PREBUILT_DIST=true` |
| SBOM | CycloneDX JSON via `anchore/sbom-action` |
| Upload artifact | `build-artifact` (`dist/`) + `app-dist-<sha>-bundle` (tarball, SBOM, SHA256SUMS) |
| Attestation | GitHub Artifact Attestations (`actions/attest-build-provenance`) on the dist tarball |
| E2E on artifact | Playwright downloads `build-artifact` and previews local `dist/` (not staging URL) |

View attestations on the repo **Actions** run or **Deployments / Attestations** UI after a green build.

### Developer fix approval (auto vs manual)

When **Code Quality** or **Security** fails on `main`, CI **does not** auto-fix by itself. A failure Issue is opened and a developer must choose:

| Choice | How | Result |
| --- | --- | --- |
| **Auto fix** | Add label `fix/auto` on the Issue, or run **Developer Fix Choice** → `auto` | Runs `lint:fix` + Prettier, commits to `main` (no `npm audit fix`) |
| **Manual fix** | Add label `fix/manual`, or run **Developer Fix Choice** → `manual` | CI leaves code unchanged; developer fixes via local commit/PR |

Workflow: `.github/workflows/developer-fix-choice.yml`

### Automated failure tickets (GitHub Issues)

When a stage fails on `main`, the pipeline opens a **GitHub Issue** ticket (not Wiki — Issues are the GitHub ticket system).

- Labels: `ci-failure`, `bug`, `needs-triage` (+ `security` for security-scan failures)
- Fix labels: `fix/auto`, `fix/manual`, `fix/auto-applied`, `fix/manual-in-progress`
- Deduplicates open tickets for the same failing stage set (adds a comment instead)
- Manual template: `.github/ISSUE_TEMPLATE/ci-failure.yml`
- Optional: add issues to a **GitHub Project** board for triage (`Issues` → `Projects`)

### Final pipeline report (GitHub Wiki)

After every `main` pipeline finishes, stage 8 publishes a complete report to the **GitHub Wiki**:

- Per-run page: `Pipeline-Report-YYYY-MM-DD-run-<id>`
- Index page: `Pipeline-Reports` (newest first, last 50 runs)
- `Home` updated with a link to the latest report

**Setup required**

1. Enable Wikis: repo **Settings → General → Features → Wikis**
2. Create any first wiki page once (so `*.wiki.git` exists)
3. Add repository secret **`WIKI_TOKEN`**: PAT with wiki write access (`GITHUB_TOKEN` usually cannot push to the wiki)

### Required GitHub Environments & secrets

Create under **Settings → Environments**.

#### Environment `ci` (Build job)

| Secret | Description |
| --- | --- |
| `VITE_API_URL` | API URL baked into the production build |

#### Environment `staging` (Deploy job)

| Secret | Description |
| --- | --- |
| `SSH_PRIVATE_KEY` | Deploy SSH private key |
| `STAGING_HOST` | Staging server hostname/IP |
| `STAGING_USER` | SSH username |
| `STAGING_SSH_KNOWN_HOSTS` | Pinned host-key lines (required) |

#### Repository secret

| Secret | Description |
| --- | --- |
| `WIKI_TOKEN` | PAT with wiki write access (report publish) |

**Pinned known_hosts (verify fingerprints out-of-band, then store):**

```bash
ssh-keyscan -t ed25519,rsa YOUR_STAGING_HOST
```

Paste the output into Environment secret `STAGING_SSH_KNOWN_HOSTS` on **staging**.  
Remove old copies of deploy/build secrets from **repository** secrets after migrating to Environments.

## 📊 Available Scripts

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Start development server             |
| `npm run build`         | Production build                     |
| `npm start`             | Start production server on port 4173 |
| `npm run preview`       | Preview production build             |
| `npm run lint`          | Run ESLint                           |
| `npm run lint:fix`      | Fix ESLint issues                    |
| `npm run format`        | Format with Prettier                 |
| `npm run format:check`  | Check formatting                     |
| `npm run test`          | Run unit tests                       |
| `npm run test:coverage` | Run tests with coverage              |
| `npm run test:e2e`      | Run E2E tests                        |
| `npm run audit`         | Audit dependencies                   |
| `npm run validate`      | Run all checks                       |

## 🌐 Page Verification

The pipeline automatically verifies:

- ✅ Home page loads (200 OK)
- ✅ About page loads (200 OK)
- ✅ Contact page loads (200 OK)
- ✅ Non-existent route behavior is validated
- ✅ Security headers present
- ✅ Response time < 500ms
- ✅ Root endpoint responds after deploy

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request into `main`

The Enterprise CI/CD pipeline runs only after the PR is **merged to `main`** (or on manual `workflow_dispatch`), not on feature-branch pushes/PRs.
