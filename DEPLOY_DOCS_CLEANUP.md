# Deployment Documentation Cleanup – Kubernetes References Removed

**Date:** November 19, 2025
**Purpose:** Remove all Kubernetes/kubectl references from deployment docs to reflect actual Docker Compose architecture

---

## Changes Made

### ✅ Updated Files

#### 1. **DEPLOY.md** (Complete Rewrite)
**Before:** Only contained Cloudflare Tunnel configuration snippets
**After:** Comprehensive production deployment guide with:
- Clear statement: "LedgerMind does not use Kubernetes in production"
- Architecture overview (Docker Compose + Cloudflare Tunnel on single host)
- Step-by-step deployment flow:
  1. Pull latest code
  2. Set build metadata
  3. Build images (`ops/docker-compose.prod.yml`)
  4. Start/update stack
  5. Verify deployment
- Cloudflare Tunnel configuration (credentials-file mode)
- All commands use `ops/docker-compose.prod.yml` (not `docker-compose.yml`)
- Production domain: `https://app.ledger-mind.org`

**Key Changes:**
- ❌ Removed: All `kubectl`, namespace, Helm references
- ❌ Removed: `docker --context desktop-linux` (local development context)
- ✅ Added: Clear Docker Compose deployment commands for production host
- ✅ Added: Build metadata export (GIT_BRANCH, GIT_COMMIT, BUILD_TIME)
- ✅ Added: Verification steps (logs, container health checks)

#### 2. **UNKNOWNS_DISMISSAL_FIX_SUMMARY.md**
**Changes:**
- ❌ Removed: References to "AWS EKS/kubectl-based" deployment
- ❌ Removed: `kubectl -n lm rollout restart deploy/lm-backend`
- ❌ Removed: PowerShell `Invoke-RestMethod` examples (replaced with bash `curl`)
- ✅ Added: Warning that LedgerMind doesn't use Kubernetes
- ✅ Added: Docker Compose deployment commands from production host
- ✅ Updated: "Production backend deployment (Docker Compose on prod host)"

**Before:**
```powershell
kubectl -n lm rollout restart deploy/lm-backend
kubectl -n lm rollout status deploy/lm-backend
```

**After:**
```bash
cd /opt/ai-finance-agent-oss-clean
git pull origin main
docker compose -f ops/docker-compose.prod.yml build backend
docker compose -f ops/docker-compose.prod.yml up -d backend
```

#### 3. **DEPLOYMENT_V2_COMPLETE.md**
**Changes:**
- ✅ Added warning at top: "⚠️ OUTDATED: This document describes a Kubernetes-based deployment from November 2025"
- ✅ Added reference: "LedgerMind no longer uses Kubernetes in production. See DEPLOY.md"
- Status changed from "PRODUCTION UPDATED" to "PRODUCTION UPDATED (HISTORICAL)"
- Content preserved for historical reference

#### 4. **DEPLOYMENT_UPDATE_REQUIRED.md**
**Changes:**
- ✅ Added warning at top: "⚠️ OUTDATED: This document describes a Kubernetes/EKS-based deployment"
- ✅ Added reference: "See DEPLOY.md for current deployment process"
- Action changed from "Rebuild & push Docker image" to "See DEPLOY.md for current deployment process"
- Content preserved for historical reference

---

## What Was NOT Changed

### ✅ Files That Are Correct (Docker Compose-based)

1. **docs/DEPLOY_CHECKLIST.md** – Already uses Docker Compose commands ✅
2. **docker-compose.prod.yml** (presumably in ops/) – Production compose file ✅
3. **cloudflared/config.yml** – Tunnel configuration ✅

### 📁 Files With Kubernetes References (Preserved as Historical)

The following files contain `kubectl` references but were left mostly intact with warning headers:
- `DEPLOYMENT_V2_COMPLETE.md` (historical pgvector deployment)
- `DEPLOYMENT_UPDATE_REQUIRED.md` (historical RAG deployment)

These documents are preserved for historical context but clearly marked as outdated.

---

## Architecture Clarification

### Production Infrastructure

**What LedgerMind DOES use:**
- ✅ Single Linux VM host (e.g., `/opt/ai-finance-agent-oss-clean`)
- ✅ Docker + Docker Compose
- ✅ `ops/docker-compose.prod.yml` for service definitions
- ✅ External Docker networks: `infra_net`, `shared-ollama`
- ✅ Cloudflare Tunnel (credentials-file mode, not token mode)
- ✅ Services: nginx, backend, postgres, cloudflared

**What LedgerMind does NOT use:**
- ❌ Kubernetes (kubectl, namespaces, pods, deployments)
- ❌ AWS EKS
- ❌ Helm charts
- ❌ Container orchestration beyond Docker Compose

### Key Services

| Service | Purpose | Port | External Access |
|---------|---------|------|-----------------|
| nginx | SPA serving + reverse proxy | 80 | Via Cloudflare Tunnel |
| backend | FastAPI app | 8000 | Via nginx proxy |
| postgres | Database | 5432 | Internal only |
| cloudflared | Tunnel connector | 2000 (metrics) | Cloudflare edge |

### Network Flow

```
User → Cloudflare Edge → Cloudflare Tunnel → nginx:80 → backend:8000
                                                       → /dist (SPA)
```

---

## Deployment Commands Quick Reference

### Standard Production Deployment

```bash
# On production host
cd /opt/ai-finance-agent-oss-clean

# Pull latest
git fetch origin && git checkout main && git pull origin main

# Set metadata
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
export GIT_COMMIT=$(git rev-parse --short=12 HEAD)
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build and deploy
docker compose -f ops/docker-compose.prod.yml build nginx backend
docker compose -f ops/docker-compose.prod.yml up -d nginx backend postgres cloudflared

# Verify
docker compose -f ops/docker-compose.prod.yml logs --tail=50 backend
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Backend-Only Update (e.g., CSRF fix)

```bash
cd /opt/ai-finance-agent-oss-clean
git pull origin main
docker compose -f ops/docker-compose.prod.yml build backend
docker compose -f ops/docker-compose.prod.yml up -d backend
docker compose -f ops/docker-compose.prod.yml logs --tail=50 backend
```

### Cloudflared Refresh

```bash
docker compose -f ops/docker-compose.prod.yml up -d --force-recreate --no-deps cloudflared
docker compose -f ops/docker-compose.prod.yml logs --tail=120 cloudflared | grep "Registered tunnel"
```

---

## Impact on Unknowns Dismissal Fix

The CSRF fix deployment process is now:

1. **Code is ready:** Commits `40d80374` (frontend) and `de2cc837` (backend)
2. **Frontend deployed:** Build `bld-251119204956` already in production
3. **Backend needs deployment:**
   ```bash
   # SSH to production host
   cd /opt/ai-finance-agent-oss-clean
   git pull origin main  # Contains commit de2cc837
   docker compose -f ops/docker-compose.prod.yml build backend
   docker compose -f ops/docker-compose.prod.yml up -d backend
   ```
4. **Verify E2E session:** Check for 3 cookies (access_token, refresh_token, csrf_token)
5. **Run E2E test:** Should pass with row dismissal working

---

## Files Changed Summary

| File | Change Type | Status |
|------|-------------|--------|
| DEPLOY.md | Complete rewrite | ✅ Production-ready |
| UNKNOWNS_DISMISSAL_FIX_SUMMARY.md | Kubernetes references removed | ✅ Updated |
| DEPLOYMENT_V2_COMPLETE.md | Warning header added | 📁 Historical |
| DEPLOYMENT_UPDATE_REQUIRED.md | Warning header added | 📁 Historical |
| DEPLOY_DOCS_CLEANUP.md | New file (this doc) | ✅ Documentation |

---

## Checklist

- [x] DEPLOY.md rewritten with Docker Compose instructions
- [x] Clear statement that Kubernetes is NOT used
- [x] All commands reference `ops/docker-compose.prod.yml`
- [x] Production domain `https://app.ledger-mind.org` used in examples
- [x] UNKNOWNS_DISMISSAL_FIX_SUMMARY.md updated with correct deployment process
- [x] Outdated Kubernetes docs marked with warning headers
- [x] Deployment flow documented: pull → export vars → build → up -d → verify
- [x] Cloudflare Tunnel config preserved and clarified
- [x] No confusion between local development and production deployment

---

## Next Steps for CSRF Fix Deployment

1. ✅ Documentation updated (this change)
2. ⏳ SSH to production host at `/opt/ai-finance-agent-oss-clean`
3. ⏳ Run backend deployment commands from DEPLOY.md
4. ⏳ Verify E2E session includes `csrf_token` cookie
5. ⏳ Run E2E test to confirm row dismissal works
