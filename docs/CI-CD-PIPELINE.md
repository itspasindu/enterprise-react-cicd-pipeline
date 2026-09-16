# Full-Stack CI/CD Pipeline

## Workflow map

```text
Pull request / main push
        │
        ▼
      ci.yml
        ├── reusable-test.yml
        │     ├── web lint, typecheck, unit coverage
        │     ├── API lint, unit, PostgreSQL integration
        │     ├── build web dist once
        │     └── Compose + five-browser Playwright
        ├── reusable-security.yml
        │     ├── web + API npm audit
        │     ├── TruffleHog
        │     ├── CodeQL
        │     └── Trivy filesystem scan
        └── reusable-docker.yml (main/manual)
              ├── web + API images
              ├── CalVer tags + immutable digests
              ├── Buildx caches
              ├── SBOM + provenance
              ├── blocking image scans
              └── release-bundle artifact

Successful main CI
        │
        ▼
      cd.yml
        ├── reusable-deploy.yml
        └── reusable-rollback.yml (deploy failure)
```

GitHub reusable workflows must be placed directly in `.github/workflows`; nested `workflows/reusable/` files are not supported.

## CI orchestration

### Triggers

| Event | Test | Security | Docker release | Deploy |
| --- | --- | --- | --- | --- |
| PR to `main` | Yes | Yes | No | No |
| Push to `main` | Yes | Yes | Yes | CD after success |
| Manual CI | Yes | Yes | Yes | Run CD with CI run ID |

Concurrency cancels stale CI runs for the same ref. Staging CD is serialized and never cancels an active deployment.

### Tests

[`reusable-test.yml`](../.github/workflows/reusable-test.yml) runs:

1. React ESLint, Prettier, TypeScript, Vitest coverage.
2. API ESLint and Vitest unit tests.
3. PostgreSQL 17 service, migrations, and API integration tests.
4. One Vite production build uploaded as `web-dist`.
5. Full Compose stack and Playwright on Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.

The frontend and Playwright share `src/config/app-contract.js`. UI copy can change without rewriting E2E assertions.

### Security

[`reusable-security.yml`](../.github/workflows/reusable-security.yml) audits both lockfiles and runs verified-secret scanning, CodeQL, and Trivy. Actions are pinned to commit SHAs and permissions are least-privilege.

## Container release

[`reusable-docker.yml`](../.github/workflows/reusable-docker.yml) consumes the exact `web-dist` artifact and creates:

```text
ghcr.io/<owner>/platform-web:YYYY.MM.N
ghcr.io/<owner>/platform-api:YYYY.MM.N
```

Both also receive `:staging` and `:sha-<short>`. The release metadata stores immutable references:

```text
ghcr.io/<owner>/platform-web@sha256:<digest>
ghcr.io/<owner>/platform-api@sha256:<digest>
```

The job uses scoped GitHub Actions Buildx caches, generates CycloneDX SBOMs, publishes provenance attestations, and blocks releases with fixed HIGH/CRITICAL image vulnerabilities.

### Release bundle

The `release-bundle` artifact contains:

- `release-metadata.json`
- `compose.yml`
- web and API CycloneDX SBOMs
- `deploy-stack.sh`, `rollback-stack.sh`, `health-check.sh`

## CD and staging

[`cd.yml`](../.github/workflows/cd.yml) is triggered by a successful `CI` workflow on `main`, or manually with a successful CI run ID.

Deployment steps:

1. Download the CI `release-bundle`.
2. Enter the `staging` GitHub Environment.
3. Optionally connect the runner with Tailscale.
4. Verify the pinned SSH host key.
5. Pull both immutable image digests on the runner.
6. Stream images over SSH with `docker save | gzip` and `docker load`.
7. Copy Compose, scripts, SBOMs, and metadata to `/opt/platform`.
8. Start PostgreSQL and wait for health.
9. Apply forward-only migrations.
10. Roll out API and web and wait for Compose health.
11. Smoke-test `/`, `/about`, `/contact`, `/api/health`, and `/api/ready`.

The VM does not need outbound access to GHCR.

### Runtime hardening

- non-root web and API containers
- read-only filesystems and tmpfs
- all Linux capabilities dropped
- `no-new-privileges`
- CPU and memory limits
- PostgreSQL only on an internal Docker network
- only web port `4173` exposed

## Database migration and rollback policy

Migrations are transaction-wrapped, recorded in `schema_migrations`, and forward-only. Application releases must use backward-compatible migrations:

1. add nullable/new structures
2. deploy code using both forms
3. backfill
4. remove old structures in a later release

Rollback restores prior web and API image digests from `/opt/platform/previous.env`. PostgreSQL data and applied migrations are preserved to prevent destructive automated rollback.

## Failure issues and wiki

CI and CD call `scripts/create-failure-ticket.sh`. Full-stack issue stages include:

- Full-Stack Tests
- Security Analysis
- Web & API Container Release
- Compose Deployment

Issues include direct run links, stage labels, reproduction guidance, and deduplication. The existing `Developer Fix Choice` workflow remains available for approved lint/format fixes or manual remediation.

`scripts/publish-wiki-report.sh` publishes the report index, stage status, artifacts, troubleshooting, and open CI issues. Wiki publishing can be invoked after CD if a `WIKI_TOKEN` is configured.

## Artifacts

| Artifact | Producer | Purpose |
| --- | --- | --- |
| `web-dist` | tests | exact frontend build |
| `web-coverage` | tests | React coverage |
| `playwright-report` | tests | traces/screenshots/report |
| `release-bundle` | Docker release | metadata, Compose, SBOMs, scripts |
| `cd-release` | CD prepare | deployment copy of release bundle |

## Required permissions and secrets

### Staging environment

- `SSH_PRIVATE_KEY`
- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_SSH_KNOWN_HOSTS`
- `POSTGRES_PASSWORD`
- optional `TAILSCALE_AUTHKEY`

### Optional repository secret

- `WIKI_TOKEN` for wiki pushes

## Operations

```bash
# Status
cd /opt/platform
docker compose --env-file current.env -f compose.yml ps

# Logs
docker compose --env-file current.env -f compose.yml logs --tail=200 web api postgres

# Health
curl -f http://127.0.0.1:4173/api/ready

# Manual application rollback
DEPLOY_ROOT=/opt/platform /opt/platform/rollback-stack.sh
```
