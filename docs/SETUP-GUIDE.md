# Pipeline setup

Secret inventory: [SECRETS.md](SECRETS.md). Day-2 commands: [RUNBOOK.md](RUNBOOK.md). Release rules: [RELEASE.md](RELEASE.md).

## Local prerequisites

- Node.js 20+ and npm 10+, matching CI
- PostgreSQL already running locally
- Git

## Local workload

PostgreSQL must already be accepting connections.

```bash
npm ci
npm run build
cd server
npm ci
export DATABASE_URL=postgres://platform:<password>@127.0.0.1:5432/platform
npm run migrate
WEB_ROOT=../dist PORT=4173 npm start
```

Open `http://127.0.0.1:4173`.

```bash
curl -f http://127.0.0.1:4173/api/ready
```

## Staging server

Ubuntu host requirements:

Confirm Node.js, jq, and curl:

```bash
node -v
jq --version
curl --version
```

PostgreSQL is already installed. It should accept the deploy user on `127.0.0.1` with the password stored as `POSTGRES_PASSWORD`. The pipeline does not install the database or Node.js.

Create the deployment directory and grant ownership to the deploy user (recommended):

```bash
sudo mkdir -p /opt/platform
sudo chown -R "$USER":"$USER" /opt/platform
```

If `/opt/platform` is not writable, CD automatically deploys to `~/platform` instead.

Only SSH and port 4173 need to be reachable from the Actions runner. PostgreSQL stays on localhost.

Do not run any other process on port 4173. The Node.js process started by CD is the only listener on that port.

## GitHub staging environment

Repository → Settings → Environments → create `staging`.

Add:

| Secret | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | private key matching deploy user's `authorized_keys` |
| `STAGING_HOST` | public IP/DNS or Tailscale IP/MagicDNS |
| `STAGING_USER` | Linux deploy user |
| `STAGING_SSH_KNOWN_HOSTS` | verified `ssh-keyscan` output |
| `POSTGRES_PASSWORD` | strong database password |
| `TAILSCALE_AUTHKEY` | optional reusable/ephemeral auth key |

Generate host keys from a trusted network path:

```bash
ssh-keyscan -t ed25519,rsa <staging-host>
```

Verify fingerprints independently before saving them.

## Release archive

The Docker release workflow publishes:

- `platform-web:YYYY.MM.N`
- `platform-api:YYYY.MM.N`
- immutable digest references

CD copies the release archive to the server with `GITHUB_TOKEN` used only for Actions. The server does not pull container images. Node.js on the host starts the API from `/opt/platform/current`.

## First release

1. Push a branch and open a PR to `main`.
2. Wait for `Test Full Stack` and `Security Full Stack`.
3. Merge to `main`.
4. CI builds and uploads `release-bundle`.
5. CD starts automatically after successful CI.
6. Check the `staging` Environment deployment and `http://<host>:4173/api/ready`.

## Manual deployment

Run Actions → CD → Run workflow and enter a successful CI run ID that contains `release-bundle`.

## Branch protection

Require a pull request and the reusable workflow checks shown after the first PR run:

- `Test Full Stack / Web Quality and Unit Tests`
- `Test Full Stack / API Unit and PostgreSQL Integration Tests`
- `Test Full Stack / Full-Stack E2E`
- `Security Full Stack / Dependency and Secret Scans`
- `Security Full Stack / CodeQL and Trivy`

## Wiki

Enable Wikis, create the first page once, and add repository secret `WIKI_TOKEN` with repository/wiki write access if automated publishing is enabled.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API not ready | `tail -n 200 /opt/platform/api.log` and `curl -f http://127.0.0.1:4173/api/ready` |
| Database authentication failure | staging `POSTGRES_PASSWORD`; the existing database keeps its current role password |
| Password changed after first deploy | update the database role |
| Web returns 502 | The Node.js process on port 4173 |
| Sample write fails | `/api/contacts` response and API logs |
| Image unavailable | CI release job and digest in `release-metadata.json` |
| SSH host key failure | refresh and independently verify `STAGING_SSH_KNOWN_HOSTS` |
| Deploy fails | CD automatically calls reusable rollback |

Changing `POSTGRES_PASSWORD` after the persistent volume is initialized does not automatically change the database role password.
