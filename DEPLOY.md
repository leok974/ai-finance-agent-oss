# LedgerMind – Production Deploy (Containers + Cloudflare Tunnel)

> **Important:** LedgerMind **does not use Kubernetes** in production.
> All deployments are done via **Docker Compose** and **Cloudflare Tunnel** on a single host.

## Architecture Overview

**Host:** Single Linux VM with Docker + Docker Compose
**Networking:**

- External Docker networks:
  - `infra_net` – shared between `nginx`, `backend`, `postgres`, `cloudflared`
  - `shared-ollama` – shared with the Ollama LLM service (if enabled)

**Services (ops/docker-compose.prod.yml):**

- `nginx` – serves the Vite-built SPA and proxies `/agent/*`, `/auth/*`, `/rules/*` to backend
- `backend` – FastAPI app (transaction ingest, suggestions, chat)
- `postgres` – main application database
- `cloudflared` – Cloudflare Tunnel connector:
  - `app.ledger-mind.org` → `http://nginx:80`
  - `ledger-mind.org` / `www.ledger-mind.org` → `http://nginx:80`

---

## Prerequisites (one-time on the prod host)

Run these **once** on the production machine where the repo lives:

```bash
# From repo root (e.g., /opt/ai-finance-agent-oss-clean)
git remote -v   # verify origin is correct

# Ensure external networks exist
docker network create infra_net      || true
docker network create shared-ollama  || true

# Optional: copy and edit env file
cp ops/.env.prod.example ops/.env.prod  # if not already done
# Edit ops/.env.prod with real secrets (DB, KMS, Cloudflare, etc.)
```

Cloudflared should already be configured with a named tunnel whose config.yml routes:

```yaml
ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80
  - hostname: ledger-mind.org
    service: http://nginx:80
  - hostname: www.ledger-mind.org
    service: http://nginx:80
  - service: http_status:404
```

---

## Normal Deploy Flow (update containers to latest main)

These commands are run on the prod host, from the repo root.

### 1. Pull latest code

```bash
cd /opt/ai-finance-agent-oss-clean

# Update main
git fetch origin
git checkout main
git pull origin main
```

### 2. Set build metadata

This ensures Nginx gets correct build info (commit, branch, timestamp):

```bash
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
export GIT_COMMIT=$(git rev-parse --short=12 HEAD)
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export BUILD_ID="manual-$(date -u +%Y%m%d-%H%M%S)"
```

### 3. Build images

Build Nginx (web) and backend images defined in `ops/docker-compose.prod.yml`:

```bash
docker compose -f ops/docker-compose.prod.yml build nginx backend
```

If you want to be explicit with build args (optional), you can run:

```bash
docker compose -f ops/docker-compose.prod.yml build \
  --build-arg VITE_BUILD_BRANCH=$GIT_BRANCH \
  --build-arg VITE_BUILD_COMMIT=$GIT_COMMIT \
  --build-arg VITE_BUILD_TIME=$BUILD_TIME \
  nginx
```

### 4. Start / update the stack

Bring up or update all critical services:

```bash
docker compose -f ops/docker-compose.prod.yml up -d nginx backend postgres cloudflared
```

Check that containers are healthy:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "ledgermind|cloudflared|postgres"
```

### 5. Verify deployment

```bash
# Check nginx logs
docker compose -f ops/docker-compose.prod.yml logs --tail=50 nginx

# Check backend logs
docker compose -f ops/docker-compose.prod.yml logs --tail=50 backend

# Check cloudflared tunnel connection (should show 4 connections)
docker compose -f ops/docker-compose.prod.yml logs --tail=20 cloudflared | grep "Registered tunnel"
```

---

## Cloudflare Tunnel (Credentials-File Mode)

We use the declarative credentials-file approach (no runtime `--token`) for reproducibility and fewer copy/paste errors.

### One-Time Tunnel Creation (local workstation)

```powershell
cloudflared tunnel login
cloudflared tunnel create ledger-mind-prod   # shows UUID like 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
```

This generates `%USERPROFILE%\.cloudflared\<UUID>.json`.

Copy that JSON into the repository (uncommitted) at `./cloudflared/<UUID>.json`.
Add / confirm `.gitignore` contains:
```
cloudflared/*.json
```

### Config File

`cloudflared/config.yml` example:
```yaml
tunnel: 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
credentials-file: /etc/cloudflared/6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5.json
originRequest:
  connectTimeout: 10s
  tcpKeepAlive: 30s
  noHappyEyeballs: true
  originServerName: ledger-mind.org
  noTLSVerify: false
ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80
  - hostname: ledger-mind.org
    service: http://nginx:80
  - hostname: www.ledger-mind.org
    service: http://nginx:80
  - service: http_status:404
```

### Compose Override Snippet

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: ["tunnel","--config","/etc/cloudflared/config.yml","--no-autoupdate","--loglevel","info","--protocol","auto","--metrics","0.0.0.0:2000","run"]
  environment:
    TUNNEL_TOKEN: ""   # explicitly disabled
  volumes:
    - ./cloudflared:/etc/cloudflared:ro
  depends_on:
    - nginx
  restart: unless-stopped
```

### Bring Up / Refresh Cloudflared

```bash
docker compose -f ops/docker-compose.prod.yml up -d --force-recreate --no-deps cloudflared
docker compose -f ops/docker-compose.prod.yml logs --tail=120 cloudflared
```

Expect 4 lines starting with `Registered tunnel connection` and no `Unauthorized: Invalid tunnel secret`.

### DNS Routing

If hostnames are new or you removed existing records:

```bash
docker compose -f ops/docker-compose.prod.yml exec cloudflared \
  cloudflared tunnel route dns 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 ledger-mind.org
```

Repeat for `www.ledger-mind.org` and `app.ledger-mind.org`. If a record already exists you may need to convert it manually to a proxied CNAME pointing to `<UUID>.cfargotunnel.com`.

### Validation Script

Run after any change to catch mismatches:

```powershell
pwsh -File scripts/validate-cloudflared-config.ps1
```

### Rotation

To rotate (rare):

```bash
cloudflared tunnel delete ledger-mind-prod   # only if recreating entirely
cloudflared tunnel create ledger-mind-prod
# Copy new <NEW-UUID>.json, update config.yml, recreate container
```

### Metrics

Metrics exposed at `http://127.0.0.1:2000/metrics` inside container. Look for `cloudflared_tunnel_ha_connections 4`.

### Notes

* Pin cloudflared image version in production.
* QUIC is default; force HTTP/2 with `--protocol http2` during network debugging.
* Validation script also ensures `TUNNEL_TOKEN` is empty to prevent regressions.

---
