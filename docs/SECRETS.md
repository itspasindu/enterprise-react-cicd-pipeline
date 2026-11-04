# Secrets and configuration

Secrets belong in GitHub Environments or repository secrets. Local API configuration can use environment variables. `.env` is gitignored. Do not commit passwords, SSH keys, or PATs.

The staging host does not download a release from a container registry. CD copies a checksummed archive over SSH.

## GitHub Environment `staging`

Create **Settings → Environments → staging**. Deploy and rollback jobs use this environment, so protection rules on it gate production-like deploys.

| Secret | Required | Purpose |
| --- | --- | --- |
| `SSH_PRIVATE_KEY` | Yes | Private key whose public half is in the deploy user's `authorized_keys`. Used by deploy and rollback. |
| `STAGING_HOST` | Yes | Public IP, DNS name, or Tailscale IP / MagicDNS of the VM. |
| `STAGING_USER` | Yes | Linux user that owns `/opt/platform` and can run Docker without `sudo`. |
| `STAGING_SSH_KNOWN_HOSTS` | Yes | Output of `ssh-keyscan` for that host. CD checks the key before connecting. |
| `POSTGRES_PASSWORD` | Yes | Password for the `platform` role. Written into `/opt/platform/current.env` at deploy time. |
| `TAILSCALE_AUTHKEY` | No | Reusable or ephemeral auth key. When set, the runner joins Tailscale before SSH. Leave unset for a publicly reachable host. |

Generate host keys from a trusted network path and verify the fingerprints before saving them:

```bash
ssh-keyscan -t ed25519,rsa <staging-host>
```

## Repository secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `WIKI_TOKEN` | No | PAT or fine-grained token that can push to this repository's wiki. CD calls `scripts/publish-wiki-report.sh` after deploy. The wiki job is `continue-on-error`, so a failed clone does not fail the deployment. Enable Wikis and create the first page once before the first publish. |

`GITHUB_TOKEN` for CI and issue creation is the automatic Actions token. Do not create a repository secret with that name.

## Local `.env`

| Variable | Required locally | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Yes | Written into `/opt/platform/current.env` as part of `DATABASE_URL`. |
| `APP_PORT` | No | Host port, default `4173`. |

API process configuration is validated in `server/src/config.js`. Set `DATABASE_URL` for a local API. `DATABASE_SSL=true` enables SSL for that URL. `WEB_ROOT` is the built web directory served on the same port as the API.

## Rotation

| Secret | How to rotate |
| --- | --- |
| `SSH_PRIVATE_KEY` | Add the new public key to `authorized_keys`, update the environment secret, run a deploy, then remove the old public key. |
| `STAGING_SSH_KNOWN_HOSTS` | Re-run `ssh-keyscan` after a host key change and replace the secret before the next deploy. A mismatch fails the known-hosts step. |
| `POSTGRES_PASSWORD` | Changing the secret does not change the role password inside the existing database. Update the database role, then redeploy so `current.env` picks up the new password. |
| `TAILSCALE_AUTHKEY` | Create a new auth key in Tailscale and replace the secret. In-flight deploys keep the previous key. |
| `WIKI_TOKEN` | Replace the secret and revoke the old token. No redeploy is required. |

CD passes `POSTGRES_PASSWORD` to the VM as base64 over SSH. It is not printed in the deploy script's release summary. Treat Actions logs as sensitive anyway.
