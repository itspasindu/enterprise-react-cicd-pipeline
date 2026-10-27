# CI/CD Pipeline

Reusable GitHub Actions pipeline for a sample workload. Pull requests are tested and scanned. A merge to `main` builds two container images once, publishes immutable digests, and deploys them to staging over SSH. A failed deploy rolls the web and API images back. Database data and applied migrations are left in place.

The workload is a web service, an API service, and a private database. This repository demonstrates the pipeline that builds, scans, and ships that workload.

## Pipeline

```mermaid
flowchart TD
  pr["Pull request to main"] --> ci["ci.yml"]
  push["Push to main"] --> ci
  manualCi["Manual CI"] --> ci
  ci --> test["Test Full Stack"]
  ci --> security["Security Full Stack"]
  test --> passed{"Tests and security passed?"}
  security --> passed
  passed -->|No| ciIssue["ci-failure issue"]
  passed -->|Yes| publish{"Push to main or manual CI?"}
  publish -->|Pull request| checks["Checks only"]
  publish -->|Yes| release["Package Release"]
  release -->|Failure| ciIssue
  release -->|Success on main| cd["cd.yml"]
  hand["Manual CD with a CI run ID"] --> cd
  cd --> deploy["Deploy Staging"]
  deploy -->|Smoke checks pass| live["Staging serving the new directory"]
  deploy -->|Failure| rollback["Point current at the previous directory"]
  rollback --> keep["Database data and migrations stay"]
```

Detail is in [the pipeline reference](docs/CI-CD-PIPELINE.md).

Reusable workflows must sit directly under `.github/workflows`. GitHub does not discover nested workflow folders.

Each release is a directory named `YYYY.MM.N-<full-sha>`. CD copies that directory to the server and points `/opt/platform/current` at it. The server does not pull from a container registry.

## What gets deployed

```mermaid
flowchart LR
  client["Client on port 4173"] --> api["Node.js process"]
  api --> pages["Web files from current/web"]
  api --> routes["/api routes"]
  routes --> db["PostgreSQL on localhost"]
```

The database is the PostgreSQL already installed on the server. Rollback switches the `current` directory and restarts Node. It does not restore database data or undo migrations.

| Check | Purpose |
| --- | --- |
| `GET /api/health` | Process liveness |
| `GET /api/ready` | API service and database readiness |
| `POST /api/contacts` | Sample write used by end-to-end tests |

## Repository layout

```text
.github/workflows/   CI, CD, and reusable workflows
server/              API service, forward-only SQL migrations, API tests
src/                 web service
compose.yml          web + API + database
scripts/             deploy, rollback, health, failure tickets, wiki
docs/                handover, secrets, runbook, releases, pipeline reference
```

## Run the workload locally

Node.js and PostgreSQL must already be running.

```bash
npm ci
npm run build
cd server
npm ci
DATABASE_URL=postgres://platform:platform@127.0.0.1:5432/platform npm run migrate
WEB_ROOT=../dist PORT=4173 npm start
```

Open `http://127.0.0.1:4173`.

## Staging secrets

| Secret | Required |
| --- | --- |
| `SSH_PRIVATE_KEY` | Yes |
| `STAGING_HOST` | Yes |
| `STAGING_USER` | Yes |
| `STAGING_SSH_KNOWN_HOSTS` | Yes |
| `POSTGRES_PASSWORD` | Yes |
| `TAILSCALE_AUTHKEY` | Optional |

The staging user should own `/opt/platform` (CD falls back to `~/platform` if needed) and have `node`, `jq`, and `curl` on the path. PostgreSQL is already installed and listens on `127.0.0.1`.

## Documentation

- [Handover](docs/HANDOVER.md)
- [Secrets](docs/SECRETS.md)
- [Runbook](docs/RUNBOOK.md)
- [Releases](docs/RELEASE.md)
- [Pipeline reference](docs/CI-CD-PIPELINE.md)
- [Setup guide](docs/SETUP-GUIDE.md)
- [HTML presentation](docs/pipeline-presentation.html)
- [PDF presentation](docs/pipeline-presentation.pdf)
