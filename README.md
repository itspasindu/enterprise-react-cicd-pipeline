# Full-Stack Platform

React/Vite web application, Node.js API, PostgreSQL, and reusable GitHub Actions CI/CD.

## Architecture

```text
Browser :4173
    │
    ▼
non-root nginx (web)
    ├── /        → React SPA
    └── /api/*   → Node API :3001
                        │
                        ▼
                   PostgreSQL 17
```

PostgreSQL is private to the Compose network and stores data in the `postgres-data` volume.

## Repository layout

```text
.github/workflows/
  ci.yml
  cd.yml
  reusable-test.yml
  reusable-security.yml
  reusable-docker.yml
  reusable-deploy.yml
  reusable-rollback.yml
server/
  src/                 Node API
  migrations/          forward-only SQL migrations
  tests/               unit + PostgreSQL integration tests
src/                   React application
compose.yml             web + API + PostgreSQL
scripts/                deploy, rollback, health, tickets, wiki
```

Reusable workflows must be directly under `.github/workflows`; GitHub does not discover nested workflow folders.

## Local development

```bash
# Web
npm ci
npm run dev

# API (separate terminal, with PostgreSQL available)
cd server
npm ci
DATABASE_URL=postgres://platform:platform@localhost:5432/platform npm run migrate
npm run dev
```

## Local full stack

```bash
cp .env.example .env
# Change POSTGRES_PASSWORD in .env
npm ci
npm run build
docker compose up -d --build --wait
```

Open `http://localhost:4173`. Stop with:

```bash
docker compose down
# Add -v only when you intentionally want to delete database data.
```

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Process liveness |
| `GET /api/ready` | API + PostgreSQL readiness |
| `POST /api/contacts` | Validate and save a contact request |
| `GET /api/pipelines/overview` | Latest CI/CD status, stages, open failures, staging summary |
| `GET /api/pipelines/runs` | Paginated CI/CD workflow runs (`?workflow=ci\|cd`) |
| `GET /api/pipelines/runs/:runId` | Run detail with mapped stages, jobs, artifacts |
| `GET /api/pipelines/runs/:runId/artifacts` | Artifacts for a run |
| `GET /api/pipelines/failures` | Open GitHub issues labeled `ci-failure` |
| `GET /api/pipelines/staging` | Live smoke probes against `STAGING_URL` |

The React contact form posts through nginx to `/api/contacts`. The Pipeline Monitor UI at `/pipeline` reads only `/api/pipelines/*`.

## Pipeline monitor

The monitor proxies live GitHub Actions data through the API so tokens stay server-side.

Set these on the API process (or in Compose via `.env`):

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | PAT with `actions:read`, `issues:read` (and `contents:read` if you need artifact metadata) |
| `GITHUB_OWNER` | Repository owner |
| `GITHUB_REPO` | Repository name |
| `STAGING_URL` | Base URL for smoke checks (Compose default: `http://web:8080`) |

Without `GITHUB_TOKEN` / owner / repo, pipeline endpoints (except `/status` and staging probes) return `503` with a setup hint, and the UI shows a configuration banner.

### Local live monitoring

```bash
cp .env.example .env
# Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO

# Terminal 1 — API (loads repo-root .env)
npm run api:dev

# Terminal 2 — Vite (proxies /api → :3001)
npm run dev
```

Open `http://localhost:3000/pipeline`. The overview auto-refreshes (faster while a run is in progress) and shows a live stage flow visualization.

## CI/CD

`ci.yml` calls reusable test and security workflows on PRs and `main`. On a successful `main` run it also calls the reusable Docker release workflow.

Docker packages:

```text
ghcr.io/<owner>/platform-web:YYYY.MM.N
ghcr.io/<owner>/platform-api:YYYY.MM.N
```

Each image also has `:staging` and `:sha-<short>` tags. Deployment uses immutable digest references (`@sha256:...`), not mutable tags.

`cd.yml` starts after successful CI, downloads `release-bundle`, transfers each image over SSH as its own archive (`docker save`, `scp`, `docker load`), applies migrations, and rolls out Compose. If deploy or smoke checks fail, it invokes the reusable rollback workflow. Database data/migrations are never automatically rolled back.

## Required staging environment secrets

| Secret | Required |
| --- | --- |
| `SSH_PRIVATE_KEY` | Yes |
| `STAGING_HOST` | Yes |
| `STAGING_USER` | Yes |
| `STAGING_SSH_KNOWN_HOSTS` | Yes |
| `POSTGRES_PASSWORD` | Yes |
| `TAILSCALE_AUTHKEY` | Optional |

The staging user should own `/opt/platform` (CD falls back to `~/platform` if needed), run Docker without `sudo`, and have Docker Compose v2 plus `jq`.

## Documentation

- [Pipeline reference](docs/CI-CD-PIPELINE.md)
- [Setup guide](docs/SETUP-GUIDE.md)
- [HTML presentation](docs/pipeline-presentation.html)
- [PDF presentation](docs/pipeline-presentation.pdf)
