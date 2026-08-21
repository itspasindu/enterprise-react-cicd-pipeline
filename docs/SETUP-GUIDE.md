# Complete Setup Guide — Enterprise React CI/CD Pipeline

Step-by-step guide to go from an empty GitHub repo + Ubuntu server to a **green pipeline** that builds, tests, attests, and deploys to staging.

**Related docs:** [CI-CD-PIPELINE.md](./CI-CD-PIPELINE.md) (how the pipeline works in detail)

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and run locally](#2-clone-and-run-locally)
3. [Prepare the staging Ubuntu server](#3-prepare-the-staging-ubuntu-server)
4. [Create SSH deploy key](#4-create-ssh-deploy-key)
5. [Network and firewall](#5-network-and-firewall)
6. [GitHub Environments and secrets](#6-github-environments-and-secrets)
7. [Enable Wiki reports](#7-enable-wiki-reports)
8. [Branch protection](#8-branch-protection)
9. [First pipeline run](#9-first-pipeline-run)
10. [Verify staging](#10-verify-staging)
11. [Developer day-to-day flow](#11-developer-day-to-day-flow)
12. [Failure handling](#12-failure-handling)
13. [Setup checklist](#13-setup-checklist)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Item | Requirement |
| --- | --- |
| GitHub repository | This project pushed to GitHub (Actions enabled) |
| Node.js (local) | ≥ 20 |
| npm (local) | ≥ 10 |
| Staging server | Ubuntu (VMware, Oracle VM, EC2, bare metal — any SSH host) |
| Network | GitHub Actions must reach the server on **TCP 22** (SSH) and **TCP 4173** (health checks), **or** use a self-hosted runner on the same network |
| Permissions | Repo admin (to create Environments, secrets, branch rules) |

**You do not need AWS.** The pipeline deploys over SSH to any Ubuntu host.

---

## 2. Clone and run locally

```bash
git clone <your-repo-url>
cd enterprise-react-cicd-pipeline   # or your folder name

npm ci
npm run lint
npm run format:check
npm run test
npm run build
npm run preview   # http://localhost:4173
```

Optional E2E (needs Playwright browsers):

```bash
npx playwright install --with-deps
CI=true npm run test:e2e
```

Confirm the app works before wiring CI/CD.

---

## 3. Prepare the staging Ubuntu server

Log in to the VM (console, SSH, or hypervisor console).

### 3.1 Install packages

```bash
sudo apt update
sudo apt install -y curl git rsync build-essential ca-certificates

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v    # expect v20.x
npm -v

# Process manager
sudo npm install -g pm2
```

### 3.2 Create app directory

The pipeline deploys to **`/opt/enterprise-react-app`**.

```bash
sudo mkdir -p /opt/enterprise-react-app /opt/enterprise-react-app_backup
sudo chown -R "$USER:$USER" /opt/enterprise-react-app /opt/enterprise-react-app_backup
```

Use the same Linux user you will put in `STAGING_USER` (examples: `ubuntu`, `opc`, your login).

**Important:** CI deploy does **not** use `sudo` (no interactive password). The deploy user must own these directories.

### 3.3 Optional firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 4173/tcp
sudo ufw enable
sudo ufw status
```

---

## 4. Create SSH deploy key

Run **on the staging server** (or generate locally and install the public key).

```bash
ssh-keygen -t ed25519 -C "github-actions-staging" -f ~/github_actions_staging -N ""

mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat ~/github_actions_staging.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Display PRIVATE key — copy entire block for GitHub
cat ~/github_actions_staging
```

Copy everything including:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Then remove the private key file from the server:

```bash
rm -f ~/github_actions_staging ~/github_actions_staging.pub
```

Keep `authorized_keys` (public key only).

### Generate pinned known_hosts

From a machine that can reach the server (or on the server using its public IP/DNS):

```bash
ssh-keyscan -t ed25519,rsa YOUR_STAGING_HOST
```

Verify host fingerprints out-of-band, then save the output for `STAGING_SSH_KNOWN_HOSTS`.

---

## 5. Network and firewall

### Option A — Tailscale (recommended for private VMware / Oracle VM)

Easiest when the Ubuntu server has **no public IP**. GitHub Actions joins your Tailscale network, then SSH/health checks use the Tailscale IP or MagicDNS name. **No need to open ports 22/4173 to the internet.**

#### On the Ubuntu staging server

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Note the Tailscale IP (100.x.y.z) and/or MagicDNS name
tailscale ip -4
tailscale status
```

Approve the device in the [Tailscale admin console](https://login.tailscale.com/admin/machines) if needed.

#### Create an auth key for CI

1. Open [Tailscale → Settings → Keys](https://login.tailscale.com/admin/settings/keys)
2. **Generate auth key**
   - Reusable: Yes (or ephemeral reusable for CI)
   - Expiration: your choice
   - Optionally tag: `tag:ci` (if you use ACL tags)
3. Copy the key (`tskey-auth-...`)

#### GitHub secret (Environment `staging`)

| Secret | Value |
| --- | --- |
| `TAILSCALE_AUTHKEY` | Auth key from Tailscale |
| `STAGING_HOST` | Tailscale IP (`100.x.y.z`) **or** MagicDNS name (e.g. `staging-vm`) |
| `STAGING_USER` | Linux user |
| `SSH_PRIVATE_KEY` | Deploy private key |
| `STAGING_SSH_KNOWN_HOSTS` | From `ssh-keyscan` **over Tailscale** (see below) |

Generate known_hosts **after** both your PC and the VM are on Tailscale:

```bash
# From a machine on the same tailnet
ssh-keyscan -t ed25519,rsa 100.x.y.z
# or
ssh-keyscan -t ed25519,rsa staging-vm
```

Paste into `STAGING_SSH_KNOWN_HOSTS`.

The deploy job runs **Connect to Tailscale** automatically when `TAILSCALE_AUTHKEY` is set, then SSH/rsync/health checks use `STAGING_HOST` on the tailnet.

#### Firewall on the VM (Tailscale path)

You can keep UFW strict for the public interface:

```bash
# Optional: only allow SSH from Tailscale CGNAT range
sudo ufw allow in on tailscale0 to any port 22
sudo ufw allow in on tailscale0 to any port 4173
# Do NOT open 22/4173 to the whole internet
```

### Option B — Public IP / DNAT (no Tailscale)

| Port | Direction | Purpose |
| --- | --- | --- |
| **22** | Inbound from internet (or GitHub IP ranges) | Actions SSH + rsync |
| **4173** | Inbound from internet (or GitHub IP ranges) | Health/smoke checks after deploy |

Leave `TAILSCALE_AUTHKEY` **unset**. Set `STAGING_HOST` to the public IP/DNS.

### Option C — Self-hosted runner

Install a GitHub Actions runner on the same LAN as the VM and set `runs-on: self-hosted` for deploy (workflow change). Use when you cannot use Tailscale or public SSH.

---

## 6. GitHub Environments and secrets

In the repo: **Settings → Environments**.

### 6.1 Create environment `ci`

Used by the **Build** job.

| Secret name | Value |
| --- | --- |
| `VITE_API_URL` | Your API base URL, or placeholder `https://api.example.com` |

**Do not** enable Required reviewers on `ci` (that would block PR builds).

### 6.2 Create environment `staging`

Used by **Deploy to Staging**.

| Secret name | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | Private key from step 4 |
| `STAGING_HOST` | Public IP/DNS **or Tailscale IP / MagicDNS** (see §5) |
| `STAGING_USER` | Linux user that owns `/opt/enterprise-react-app` |
| `STAGING_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan` (over Tailscale if using Option A) |
| `TAILSCALE_AUTHKEY` | *(Optional)* Tailscale auth key for private VMs |

Do **not** enable Required reviewers on `staging` if you want **automatic** deploy after green CI (current design).

### 6.3 Repository secret (optional but recommended)

**Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
| --- | --- |
| `WIKI_TOKEN` | Personal Access Token with wiki write access |

#### Create `WIKI_TOKEN`

1. GitHub → **Settings → Developer settings → Personal access tokens**
2. Fine-grained: grant this repo **Contents: Read and write**  
   or Classic: scope **`repo`**
3. Paste into repository secret `WIKI_TOKEN`

### 6.4 Clean up

Remove any old copies of `SSH_PRIVATE_KEY` / `STAGING_*` / `VITE_API_URL` from **repository** secrets after they live in Environments.

---

## 7. Enable Wiki reports

1. **Settings → General → Features → Wikis** → enable  
2. Open **Wiki** tab → create a first page (e.g. “Home”) so `*.wiki.git` exists  
3. Ensure `WIKI_TOKEN` is set (step 6.3)

After each push to `main`, stage **Publish Wiki Report** updates:

- `Pipeline-Report-YYYY-MM-DD-run-<id>`
- `Pipeline-Reports` (index)
- `Home` (latest link)

---

## 8. Branch protection

**Settings → Branches → Add rule** for `main`:

| Setting | Recommended |
| --- | --- |
| Require a pull request before merging | On |
| Require approvals | 1+ |
| Require status checks to pass | On |
| Require branches to be up to date | On |
| Block force pushes | On |
| Block deletions | On |

### Required status checks

After **one PR** has run the pipeline, select:

- `Code Quality Checks`
- `Security Analysis`
- `Unit Tests`
- `Build & Bundle Analysis`
- `E2E Tests`

**Do not** require `Deploy to Staging` on PRs (deploy runs only after merge to `main`).

---

## 9. First pipeline run

### Path A — Pull request (recommended)

```bash
git checkout -b features/first-deploy
# make a tiny change if needed
git push -u origin HEAD
```

Open a PR into `main`. Confirm these jobs pass:

1. Code Quality Checks  
2. Security Analysis  
3. Unit Tests  
4. Build & Bundle Analysis  
5. E2E Tests  

Deploy / Wiki / tickets should **not** run on the PR.

Merge the PR → full pipeline on `main`, including **Deploy to Staging**.

### Path B — Manual

**Actions → Enterprise CI/CD Pipeline → Run workflow** (branch `main`).

---

## 10. Verify staging

After deploy succeeds:

```text
http://YOUR_STAGING_HOST:4173/
http://YOUR_STAGING_HOST:4173/about
http://YOUR_STAGING_HOST:4173/contact
```

On the server:

```bash
pm2 status
pm2 logs enterprise-react-app --lines 50
ls -la /opt/enterprise-react-app/dist/
```

In GitHub Actions:

- Download `build-artifact`, `app-dist-<sha>-bundle`, `playwright-report`
- Check **Attestations** for the dist tarball
- Open Wiki → **Pipeline Reports**

---

## 11. Developer day-to-day flow

```text
feature branch
    → open PR to main
    → wait for 5 PR jobs (quality, security, unit, build, E2E)
    → review + merge
    → main pipeline: same gates + staging deploy + wiki (+ tickets on failure)
```

Local commands before push:

```bash
npm ci
npm run lint
npm run format:check
npx tsc --noEmit
npm run test
npm run build
```

---

## 12. Failure handling

On `main` failures, CI opens a GitHub Issue (`ci-failure`).

| Label | Effect |
| --- | --- |
| `fix/auto` | Runs lint/format fix and commits to `main` (**not** `npm audit fix`) |
| `fix/manual` | Checklist only — you fix via PR |

Or: **Actions → Developer Fix Choice → Run workflow**.

---

## 13. Setup checklist

### Local

- [ ] `npm ci` succeeds  
- [ ] `npm run validate` or lint/test/build pass  
- [ ] Preview works on `:4173`

### Staging Ubuntu (VMware / any host)

- [ ] Node ≥ 20, npm, PM2, git, rsync installed  
- [ ] `/opt/enterprise-react-app` owned by deploy user  
- [ ] Deploy public key in `~/.ssh/authorized_keys`  
- [ ] Ports **22** and **4173** reachable from GitHub Actions **or** Tailscale configured (`TAILSCALE_AUTHKEY` + Tailscale IP as `STAGING_HOST`) **or** self-hosted runner ready

### GitHub

- [ ] Environment **`ci`** + `VITE_API_URL`  
- [ ] Environment **`staging`** + `SSH_PRIVATE_KEY`, `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KNOWN_HOSTS` (+ `TAILSCALE_AUTHKEY` if private VM)
- [ ] Repo secret **`WIKI_TOKEN`** (optional)  
- [ ] Wiki enabled + first page created  
- [ ] Branch protection on `main` + required PR checks  
- [ ] Manual SSH test: `ssh -i key USER@HOST` works  

### First green run

- [ ] PR pipeline green (5 jobs)  
- [ ] Merge to `main`  
- [ ] Deploy Staging green  
- [ ] App loads at `http://HOST:4173`  
- [ ] Wiki report published (if configured)

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build fails: missing `VITE_API_URL` | `ci` env secret missing | Add secret to Environment `ci` |
| Deploy: `STAGING_SSH_KNOWN_HOSTS` error | Secret empty | Paste `ssh-keyscan` output |
| Deploy: SSH timeout / connection refused | Firewall / no public IP | Open TCP 22 or use self-hosted runner |
| Deploy: Permission denied (publickey) | Wrong key/user | Match `STAGING_USER` and key in `authorized_keys` |
| Health check fails after deploy | Port 4173 blocked or PM2 down | `pm2 status`; open 4173; check `pm2 logs` |
| Wiki publish fails | Wiki off or bad token | Enable Wiki; recreate `WIKI_TOKEN` |
| PR checks missing in branch protection | No PR run yet | Open one PR and wait for jobs |
| `ci` environment waits for approval | Required reviewers on `ci` | Disable reviewers on `ci` |
| E2E homepage assertion fails | UI text changed | Update `tests/e2e/navigation.spec.js` |

### Quick SSH smoke test from your PC

```bash
ssh -i ./github_actions_staging YOUR_USER@YOUR_HOST "node -v && npm -v && pm2 -v && ls /opt/enterprise-react-app"
```

### Reproduce CI locally

```bash
npm ci
npm run lint && npm run format:check && npx tsc --noEmit
npm audit --audit-level=high
npm run test:coverage
npm run build
CI=true npm run test:e2e
```

---

## What the pipeline does after setup

```text
PR → main
  Code Quality → Security → Unit Tests → Build (SBOM + attest) → E2E
  (no deploy)

Merge / push → main
  Same gates → Deploy Staging (SSH + prebuilt dist + PM2)
            → Failure ticket (if fail)
            → Wiki report
```

**App URL after deploy:** `http://STAGING_HOST:4173`

---

## Next steps (optional)

- Put **Nginx + HTTPS** in front of port 4173  
- Add a **production** Ubuntu VM + `production` Environment + manual approval  
- Restrict SSH to office/VPN IPs  
- Install a **self-hosted runner** if the VM stays on a private network  

For stage-by-stage behavior, see [CI-CD-PIPELINE.md](./CI-CD-PIPELINE.md).
