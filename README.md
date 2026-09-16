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

The React contact form posts through nginx to `/api/contacts`.

## CI/CD

`ci.yml` calls reusable test and security workflows on PRs and `main`. On a successful `main` run it also calls the reusable Docker release workflow.

Docker packages:

```text
ghcr.io/<owner>/platform-web:YYYY.MM.N
ghcr.io/<owner>/platform-api:YYYY.MM.N
```

Each image also has `:staging` and `:sha-<short>` tags. Deployment uses immutable digest references (`@sha256:...`), not mutable tags.

`cd.yml` starts after successful CI, downloads `release-bundle`, transfers both images over SSH (`docker save | docker load`), applies migrations, and rolls out Compose. If deploy or smoke checks fail, it invokes the reusable rollback workflow. Database data/migrations are never automatically rolled back.

## Required staging environment secrets

| Secret | Required |
| --- | --- |
| `SSH_PRIVATE_KEY` | Yes |
| `STAGING_HOST` | Yes |
| `STAGING_USER` | Yes |
| `STAGING_SSH_KNOWN_HOSTS` | Yes |
| `POSTGRES_PASSWORD` | Yes |
| `TAILSCALE_AUTHKEY` | Optional |

The staging user must own `/opt/platform`, run Docker without `sudo`, and have Docker Compose v2 plus `jq`.

## Documentation

- [Pipeline reference](docs/CI-CD-PIPELINE.md)
- [Setup guide](docs/SETUP-GUIDE.md)
- [HTML presentation](docs/pipeline-presentation.html)
- [PDF presentation](docs/pipeline-presentation.pdf)
