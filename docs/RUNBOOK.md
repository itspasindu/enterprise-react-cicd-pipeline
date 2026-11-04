# Operations runbook

Staging serves the deployed workload on port `4173`. Deploy files are in `/opt/platform` (or `~/platform` if that directory was not writable). Commands below assume `/opt/platform`.

## Status

```bash
cd /opt/platform
readlink -f current
curl -f http://127.0.0.1:4173/api/ready
```

`/api/health` is process liveness. `/api/ready` checks the API and PostgreSQL.

Page and header check from a machine that can reach the host:

```bash
/opt/platform/health-check.sh http://127.0.0.1:4173
```

Logs:

```bash
tail -n 200 /opt/platform/api.log
```

Release identity currently running:

```bash
jq '{version, commit, directoryName, runtime}' /opt/platform/current/release.json
```

## Deploy

CD starts after a successful CI workflow on `main`. It is serialized (`staging-deploy`) and does not cancel an in-progress deploy.

To redeploy a release that already built successfully:

1. Open Actions → CD → Run workflow.
2. Enter the CI run ID that uploaded `release-bundle`.
3. Watch **Deploy Staging**. On failure, **Roll Back Staging** runs automatically.

CD does not check out the repository. The archive comes from the release bundle. The runner copies it over SSH, verifies checksums, points `current` at the new directory, applies forward-only migrations with the Node.js already on the host, and restarts the process.

Smoke checks after deploy require `GET /`, `/about`, `/contact`, `/api/health`, and `/api/ready` to succeed.

## Rollback

Automatic rollback runs only when the deploy job fails. It points `current` at the directory in `/opt/platform/previous-release.json` and restarts Node.js.

Database data and rows in `schema_migrations` stay as they are. Ship backward-compatible migrations. See [RELEASE.md](RELEASE.md).

Manual rollback on the VM, when a previous release is recorded:

```bash
DEPLOY_ROOT=/opt/platform /opt/platform/rollback-release.sh
```

If `previous-release.json` is missing, or the previous directory is gone, the script exits 0 and prints that rollback was skipped.

## Failure issues

CI opens or updates a GitHub issue when Test Full Stack, Security Full Stack, or Package Release fails. CD does the same when the host deploy fails. Issues use the label `ci-failure`, link to the Actions run, and name the stage:

- Full-Stack Tests
- Security Analysis
- Web & API Container Release
- Host Deployment

`Developer Fix Choice` (`.github/workflows/developer-fix-choice.yml`) can apply an approved lint or format fix, or record that a person will fix the issue manually. It does not deploy.

Wiki publishing after CD is optional and non-blocking. It needs `WIKI_TOKEN` and the repository wiki enabled. See [SECRETS.md](SECRETS.md).

## When something fails

| Symptom | What to do |
| --- | --- |
| API not ready | `tail -n 200 /opt/platform/api.log` |
| Database authentication failure | Confirm the staging `POSTGRES_PASSWORD`. The existing database keeps its current role password. |
| Web returns 502 | The Node.js process on port 4173 |
| Release unavailable | Open the CI run and confirm Package Release uploaded `release-bundle`. |
| SSH host key failure | Refresh `STAGING_SSH_KNOWN_HOSTS` and verify the fingerprint out of band. |
| Port 4173 already in use | Stop the other process on 4173. CD's Node.js process is the listener. |
| Deploy failed | CD calls rollback for the previous release directory. Check the rollback job log, then `curl -f http://127.0.0.1:4173/api/ready`. |
