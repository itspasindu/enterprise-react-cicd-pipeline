# Releases

Package Release runs on a push to `main` after tests and security succeed, and on a manual CI run. Pull requests run tests and security only. They do not publish images or start CD.

## Version and tags

Versions are calendar versions, `YYYY.MM.N`, in UTC. `N` is one higher than the highest `release-YYYY.MM.*` artifact already stored for that month.

The release directory name is `YYYY.MM.N-<full-sha>`. Deploy runs that directory by pointing `/opt/platform/current` at it. There is no mutable tag.

`release.json` stores:

- `version`
- `commit` — full SHA
- `directoryName`
- `runtime` — `host-node`

The runner installs API production dependencies before packing the archive, then checks `checksums.txt` again on the server before switching `current`.

## Release bundle

`reusable-release.yml` uploads two artifacts:

| Artifact | Retention role |
| --- | --- |
| `release-bundle` | What CD downloads |
| `release-<CalVer>-<full-sha>` | Immutable copy. The name is not `latest`. |

`release-bundle` contains:

- `release.json` — version, full commit SHA, workflow run id, repository, directory name
- `release-metadata.json` — the same document
- `checksums.txt` — `sha256sum` manifest; deploy refuses to continue if it does not match
- `web/` — built web files
- `api/` — API, migrations, and production dependencies
- `deploy-release.sh`, `rollback-release.sh`, `health-check.sh`, `lib/host-process.sh`
- CycloneDX SBOMs for the web and API lockfiles

CD copies that bundle to a short-lived artifact named `cd-release` (7 days) and deploys from the copy.

## Required pull request checks

After the first PR, require these checks before merge to `main`:

- `Test Full Stack / Web Quality and Unit Tests`
- `Test Full Stack / API Unit and PostgreSQL Integration Tests`
- `Test Full Stack / Full-Stack E2E`
- `Security Full Stack / Dependency and Secret Scans`
- `Security Full Stack / CodeQL and Trivy`

`Test Full Stack / Build Web Artifact` produces the `web-dist` artifact that Package Release consumes. E2E depends on it. A green E2E check means that build job succeeded.

Concurrency group `ci-<ref>` cancels older CI runs on the same ref. Staging deploys are not cancelled.

## Database migrations

Migrations in `server/migrations/` are applied in order, wrapped in a transaction, and recorded in `schema_migrations`. They are forward-only.

Each application release must keep working with the previous schema and the new one:

1. Add nullable columns or new tables.
2. Deploy code that reads and writes both shapes.
3. Backfill.
4. Remove the old shape in a later release.

Rollback restores the previous release directory only. It does not run down migrations and it does not restore the database.

## What a normal `main` push does

1. CI runs tests and security in parallel.
2. Package Release builds from the `web-dist` artifact, scans, pushes, and uploads `release-bundle`.
3. The CD workflow starts because CI on `main` completed successfully.
4. CD enters the `staging` environment, copies the archive, migrates, restarts Node.js, and smoke-tests.
5. On deploy failure, rollback points `current` at the previous directory and a `ci-failure` issue is opened or updated.
6. Wiki publish runs when `WIKI_TOKEN` is set. A wiki failure does not fail the deployment.
