# 🚀 Enterprise React Application

A production-ready, enterprise-grade React application built with Vite, featuring a comprehensive CI/CD pipeline, security hardening, and automated deployment.

## 📁 Project Structure

```
enterprise-react-app/
├── .github/
│   └── workflows/
│       └── enterprise-ci-cd.yml    # Full CI/CD pipeline
├── scripts/
│   ├── health-check.sh             # Comprehensive health check script
│   └── deploy.sh                   # EC2 deployment and process automation
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

The pipeline runs 6 stages:

```
1. Code Quality      → ESLint, Prettier, TypeScript checks
2. Security Scan     → npm audit, TruffleHog, CodeQL, Trivy
3. Unit Tests        → Vitest with coverage report artifact
4. Build             → Production build + bundle analysis
5. E2E Tests         → Playwright across multiple browsers
6. Deploy Staging    → Sync to EC2, build, and start with PM2
```

### Required GitHub Secrets

| Secret            | Description                |
| ----------------- | -------------------------- |
| `SSH_PRIVATE_KEY` | SSH key for staging server |
| `STAGING_HOST`    | Staging server IP/hostname |
| `STAGING_USER`    | Staging SSH username       |
| `VITE_API_URL`    | API endpoint URL           |

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
5. Open a Pull Request

The CI pipeline will automatically run all checks on your PR.
