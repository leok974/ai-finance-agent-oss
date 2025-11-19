# Nginx Container Cleanup Summary

**Date:** November 18, 2025
**Issue:** Multiple nginx containers competing for production traffic

---

## Problem Identified

### Container Inventory Before Cleanup

| Container Name | Image | Port Binding | Status | Purpose |
|---|---|---|---|---|
| `ai-finance-nginx-1` | `my-nginx-custom` | 0.0.0.0:80 | Unhealthy | ❌ **Legacy dev stack** |
| `ai-finance-agent-oss-clean-nginx-1` | `ai-finance-agent-oss-clean-nginx:latest` | 127.0.0.1:8083 | Healthy | ✅ **Prod stack** |

### Root Cause

Two separate Docker Compose stacks were running simultaneously:

1. **Dev Stack** (`docker-compose.yml`)
   - Container: `ai-finance-nginx-1`
   - Image: `my-nginx-custom` (old, cached build)
   - Port: `0.0.0.0:80` (public)
   - Networks: `infra_net`, `ai-finance_default`

2. **Prod Stack** (`docker-compose.prod.yml`)
   - Container: `ai-finance-agent-oss-clean-nginx-1`
   - Image: `ai-finance-agent-oss-clean-nginx:latest` (fresh build)
   - Port: `127.0.0.1:8083` (localhost only for E2E testing)
   - Networks: `infra_net`, `shared-ollama`

### Impact

- **Cloudflare Tunnels** (`cfd-a`, `cfd-b`) were connecting to **both** containers via `infra_net`
- Docker network DNS resolution for `nginx` service could resolve to either container
- Production traffic could randomly hit the old container with stale code

---

## Solution Implemented

### 1. Created Cleanup Scripts

**Bash:** `scripts/cleanup-nginx-orphans.sh`
**PowerShell:** `scripts/cleanup-nginx-orphans.ps1`

These scripts:
- Show expected production nginx container
- List all nginx-related containers
- Stop legacy dev stack
- Remove orphaned containers
- Verify cleanup success

### 2. Executed Cleanup

```powershell
.\scripts\cleanup-nginx-orphans.ps1
```

**Actions taken:**
1. ✅ Identified prod container: `ai-finance-agent-oss-clean-nginx-1`
2. ✅ Stopped dev stack: `docker compose down nginx`
3. ✅ Removed orphan: `ai-finance-nginx-1` (old dev container)
4. ✅ Removed orphan: `ai-finance-agent-oss-clean-web-1` (dev web service)
5. ✅ Restarted Cloudflare tunnels to refresh DNS cache

### 3. Verification

```powershell
.\scripts\check-ledgermind-prod-version.ps1
```

**Result:**
```
✅ Prod matches local HEAD. Safe to debug app behavior.
Remote: branch=fix/agent-api-422-401 commit=917f9184
Local : branch=fix/agent-api-422-401 commit=917f9184
```

---

## Container Inventory After Cleanup

| Container Name | Image | Port Binding | Status | Purpose |
|---|---|---|---|---|
| `ai-finance-agent-oss-clean-nginx-1` | `ai-finance-agent-oss-clean-nginx:latest` | 127.0.0.1:8083 | ✅ Healthy | Production |
| `ai-finance-agent-oss-clean-nginx-reloader-1` | `docker:cli` | None | Running | Cert renewal |
| `applylens-nginx` | `nginx:1.27-alpine` | 0.0.0.0:8888 | Running | Separate project |
| `portfolio-nginx` | Portfolio image | None | Restarting | Separate project |

**Legacy containers removed:**
- ❌ `ai-finance-nginx-1` (old LedgerMind dev container)
- ❌ `ai-finance-agent-oss-clean-web-1` (orphaned web service)

---

## Network Architecture (Clarified)

### Production Setup (Tunnel-Based)

```
Internet
    ↓
Cloudflare CDN
    ↓
Cloudflare Tunnel (cfd-a, cfd-b)
    ↓ (via Docker network "infra_net")
nginx service (ai-finance-agent-oss-clean-nginx-1)
    ↓ (internal port 80, exposed as 127.0.0.1:8083 for E2E)
Static files + API proxy to backend:8000
```

**Key Points:**
- No public port 80 binding needed (tunnel connects via internal Docker network)
- Port `127.0.0.1:8083` only for E2E testing bypass
- Cloudflare Tunnels resolve `nginx` service via Docker DNS
- Multiple nginx containers on same network = DNS race condition

---

## Prevention Measures

### 1. Use Explicit Compose Files

**Don't:**
```bash
docker compose up -d nginx  # Uses default docker-compose.yml
```

**Do:**
```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

### 2. Stop Dev Stack Before Prod Deploy

```bash
# Stop dev stack first
docker compose down

# Then start prod stack
docker compose -f docker-compose.prod.yml up -d
```

### 3. Use Cleanup Script Regularly

```bash
# Before each deployment
scripts/cleanup-nginx-orphans.sh  # or .ps1 on Windows
```

### 4. Monitor Container Count

```bash
# Should show only ONE LedgerMind nginx container
docker ps | grep nginx
```

---

## Files Created/Modified

### New Files
- `scripts/cleanup-nginx-orphans.sh` (Bash cleanup script)
- `scripts/cleanup-nginx-orphans.ps1` (PowerShell cleanup script)
- `NGINX_CLEANUP_SUMMARY.md` (this document)

### Modified Files
- `scripts/README.md` (Added cleanup script documentation)

---

## Lessons Learned

### Problem
Multiple compose stacks creating duplicate nginx containers on the same network.

### Root Cause
Dev stack (`docker-compose.yml`) was never stopped when switching to prod stack (`docker-compose.prod.yml`).

### Solution
Explicit compose file management + orphan cleanup.

### Prevention
Always use explicit `-f` flag and clean up orphans before deploying.

---

## Quick Reference

### Check Container Status
```bash
docker ps -a --filter "name=nginx" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Stop Dev Stack
```bash
docker compose down
```

### Start Prod Stack
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Clean Up Orphans
```bash
scripts/cleanup-nginx-orphans.sh  # Bash
.\scripts\cleanup-nginx-orphans.ps1  # PowerShell
```

### Verify Production
```bash
scripts/check-ledgermind-prod-version.sh  # Bash
.\scripts\check-ledgermind-prod-version.ps1  # PowerShell
```

---

## Impact

**Before Cleanup:**
- 🔴 Two nginx containers competing for traffic
- 🔴 Cloudflare tunnels could route to stale container
- 🔴 Production serving wrong build intermittently

**After Cleanup:**
- ✅ Single nginx container serving production
- ✅ Cloudflare tunnels connected to correct container
- ✅ Production consistently serving latest build
- ✅ Automated cleanup scripts prevent recurrence

---

## Conclusion

The nginx container cleanup successfully:
1. ✅ Removed orphaned legacy dev container
2. ✅ Established single source of truth for production nginx
3. ✅ Verified Cloudflare tunnels connecting correctly
4. ✅ Created automation to prevent future duplicates
5. ✅ Documented architecture and best practices

**Production is now clean and serving the correct build exclusively.**
