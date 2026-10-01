# Full-Stack Setup Guide

## Local prerequisites

- Node.js 20+
- npm 10+
- Docker Engine with Compose v2
- Git

## Local application

```bash
cp .env.example .env
# Set a strong POSTGRES_PASSWORD
npm ci
npm run build
docker compose up -d --build --wait
```

Open `http://localhost:4173`.

```bash
docker compose ps
docker compose logs -f web api postgres
curl -f http://localhost:4173/api/ready
```

Stop without deleting data:

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete PostgreSQL data.

## API development

Run PostgreSQL with Compose, then start the API locally:

```bash
docker compose up -d postgres
cd server
npm ci
export DATABASE_URL=postgres://platform:<password>@localhost:5432/platform
npm run migrate
npm run dev
```

The API listens on port 3001.

## Staging server

Ubuntu host requirements:

```bash
sudo apt-get update
sudo apt-get install -y docker.io jq
sudo usermod -aG docker "$USER"
# log out/in, then:
docker --version
jq --version
```

Docker Compose v2 (`docker compose`) is required. If the VM has outbound internet you can install the CLI plugin yourself; **if it cannot reach GitHub/DNS** (common on Tailscale-only VMs), CD downloads Compose on the Actions runner and copies it to `~/.docker/cli-plugins/docker-compose` over SSH — no outbound access needed on the VM.

Create the deployment directory and grant ownership to the deploy user (recommended):

```bash
sudo mkdir -p /opt/platform
sudo chown -R "$USER":"$USER" /opt/platform
sudo usermod -aG docker "$USER"
```

If `/opt/platform` is not writable, CD automatically deploys to `~/platform` instead.

Log out and back in, then confirm `docker info` works without `sudo`.

Only SSH and application port 4173 need to be reachable from the Actions runner. PostgreSQL and the API are not exposed directly.

Do not run `npm run preview`, Vite, or any other Node process on port 4173 on the staging VM. The `platform-web` container is the only listener on that port. A leftover preview will be killed during deploy and, if something restarts it, Compose fails with `address already in use`.

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
| `PIPELINE_GITHUB_TOKEN` | fine-grained token that can read this repo's Actions (`actions:read`, ideally `issues:read`). CD writes it to the API as `GITHUB_TOKEN`. The built-in Actions token expires when the job ends, so it cannot drive the live status page. **Required** for `/api/pipelines/overview` on staging — without it the page returns 503. |

Generate host keys from a trusted network path:

```bash
ssh-keyscan -t ed25519,rsa <staging-host>
```

Verify fingerprints independently before saving them.

## GHCR

The Docker release workflow publishes:

- `platform-web:YYYY.MM.N`
- `platform-api:YYYY.MM.N`
- immutable digest references

The CD runner downloads both images using `GITHUB_TOKEN` and streams them to staging. The VM itself does not need DNS or outbound connectivity to `ghcr.io`.

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
| API not ready | `docker compose --env-file /opt/platform/current.env -f /opt/platform/compose.yml logs api postgres` |
| Database authentication failure | staging `POSTGRES_PASSWORD`; existing volume retains original DB credentials |
| Password changed after first deploy | update the role inside PostgreSQL or recreate the volume only if data can be deleted |
| Web returns 502 | API health and Compose backend network |
| Pipeline page 503 / overview fails on VM | (1) staging secret `PIPELINE_GITHUB_TOKEN` must be set; (2) API must be on the `egress` network in `compose.yml` — the internal `backend` network cannot reach `api.github.com`. Check `curl -s http://127.0.0.1:4173/api/pipelines/status` on the VM (`configured` should be `true`) and `docker compose ... logs api` |
| Contact form fails | `/api/contacts` response and API logs |
| Image unavailable | CI release job and digest in `release-metadata.json` |
| SSH host key failure | refresh and independently verify `STAGING_SSH_KNOWN_HOSTS` |
| Deploy fails | CD automatically calls reusable rollback |

Changing `POSTGRES_PASSWORD` after the persistent volume is initialized does not automatically change the database role password.
