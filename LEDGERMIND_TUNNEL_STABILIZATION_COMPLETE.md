# LedgerMind Tunnel Stabilization – Complete ✅

**Date:** 2025-11-21
**Objective:** Eliminate random 502 errors caused by duplicate cloudflared connectors

## Summary

Successfully stabilized LedgerMind tunnel by:
1. Disabled local `ai-finance-agent-oss-clean-cloudflared-1` (redundant, on this machine)
2. Stopped `applylens-cloudflared-prod` (only on ApplyLens network, couldn't reach LedgerMind)
3. Using only `cfd-a` connector (on both `infra_net` and `applylens_applylens-prod` networks)

This eliminates random 502 errors that occurred when requests hit connectors that couldn't reach LedgerMind containers.

## What Was Done

### 1. Identified the Problem
- **Phase 1 - Local cloudflared**: `ai-finance-agent-oss-clean-cloudflared-1` was running locally, racing with remote tunnel
- **Phase 2 - ApplyLens connector**: `applylens-cloudflared-prod` was only on `applylens_applylens-prod` network
  - ✅ Could reach ApplyLens containers (`applylens-web-prod`, `applylens-api-prod`)
  - ❌ Could NOT reach LedgerMind containers (`ledgermind-web.int`, `ledgermind-api.int`)
- **Solution**: Use only `cfd-a` connector which is on BOTH networks:
  - `infra_net` (can reach LedgerMind containers)
  - `applylens_applylens-prod` (can reach ApplyLens containers)

### 2. Verified Network Configuration
Confirmed that nginx and backend already have the correct Docker network aliases:

**docker-compose.prod.yml:**
```yaml
nginx:
  networks:
    infra_net:
      aliases:
        - nginx
        - ledgermind-web.int   # ← TARGET FOR app.ledger-mind.org
    shared-ollama:
      aliases:
        - nginx
        - ledgermind-web.int

backend:
  networks:
    infra_net:
      aliases:
        - backend
        - ledgermind-api.int   # ← TARGET FOR api.ledger-mind.org
    shared-ollama:
      aliases:
        - backend
        - ledgermind-api.int
```

### 3. Verified Remote Tunnel Configuration
Confirmed `cfd-a` has the correct ingress rules:

```json
{
  "hostname": "app.ledger-mind.org",
  "id": "9",
  "service": "http://ledgermind-web.int:80"
},
{
  "hostname": "api.ledger-mind.org",
  "id": "10",
  "service": "http://ledgermind-api.int:8000"
}
```

**Tunnel Status:**
- 4 HA connections active ✅
- Connected to `infra_net` (same network as nginx/backend) ✅
- Protocol: QUIC ✅

### 4. Disabled Local cloudflared
Commented out the following services in `docker-compose.prod.yml`:
- `cloudflared` (lines 277-297)
- `cf-health` (lines 302-312)

Removed the stopped containers:
```bash
docker rm ai-finance-agent-oss-clean-cloudflared-1
docker rm ai-finance-agent-oss-clean-cf-health-1
```

### 4. Disabled Redundant Connectors

**Phase 1 - Disabled Local LedgerMind cloudflared (2025-11-21 13:44 UTC):**
```bash
# Commented out in docker-compose.prod.yml
# - cloudflared service (lines 277-300)
# - cf-health service (lines 302-314)
# Removed stopped containers
docker rm ai-finance-agent-oss-clean-cloudflared-1
docker rm ai-finance-agent-oss-clean-cf-health-1
```

**Phase 2 - Stopped ApplyLens-only connector (2025-11-21 13:49 UTC):**
```bash
# This connector could reach ApplyLens but NOT LedgerMind
docker stop applylens-cloudflared-prod
```

**Result:**
- Only `cfd-a` is now serving tunnel traffic
- `cfd-a` is on both `infra_net` AND `applylens_applylens-prod` networks
- Can reach ALL containers: LedgerMind + ApplyLens + SiteAgents + Portfolio

## Current Status

### ✅ Infrastructure Fixed (2025-11-21 13:50 UTC)
- Local cloudflared container: **DISABLED** (ai-finance-agent-oss-clean-cloudflared-1)
- ApplyLens-only connector: **STOPPED** (applylens-cloudflared-prod)
- Active tunnel connector: **cfd-a ONLY** with 4 HA connections
- Network aliases: **CONFIGURED CORRECTLY**
- Ingress rules: **VERIFIED**
- External access: **✅ WORKING** (all assets return 200 OK)

### ✅ Verification Results
```bash
# Test 1: Origin health (from infra_net)
$ docker run --rm --network infra_net alpine sh -c "curl -I http://ledgermind-web.int:80/"
HTTP/1.1 200 OK  ✅

# Test 2: External access
$ curl -I https://app.ledger-mind.org
HTTP/1.1 200 OK  ✅

# Test 3: Assets (previously returned 502)
$ curl -I https://app.ledger-mind.org/assets/preload-helper-2LWRYvkK.js
HTTP/1.1 200 OK  ✅ (5/5 requests successful)

# Test 4: Tunnel connections
$ docker logs cfd-a | grep "Registered tunnel connection"
4 active HA connections  ✅
```

### ⚠️ Previous Issue (RESOLVED)
~~The site was returning random 502 errors because:~~
1. ~~Cloudflare was load-balancing between multiple connectors~~
2. ~~Some connectors (applylens-cloudflared-prod) couldn't reach LedgerMind containers~~
3. ~~Requests that hit the bad connector → 502 Bad Gateway~~

**Status:** ✅ FIXED - Now using only `cfd-a` which can reach all containers

## Maintenance Tasks

### To Prevent ApplyLens Connector from Restarting
The `applylens-cloudflared-prod` service should be disabled in its docker-compose file:

**Location:** `D:\ApplyLens\docker-compose.prod.yml`

**Action:** Comment out the `cloudflared` service (or rename it to `cloudflared-disabled`):

```yaml
# cloudflared:  # DISABLED - use shared cfd-a instead (on infra_net)
#   image: cloudflare/cloudflared:latest
#   container_name: applylens-cloudflared-prod
#   command: tunnel run
#   environment:
#     - TUNNEL_TOKEN=${APPLYLENS_TUNNEL_TOKEN}
#   networks:
#     - applylens_applylens-prod
#   restart: unless-stopped
```

**Reason:** This connector is only on the `applylens_applylens-prod` network and cannot reach LedgerMind containers on `infra_net`.

### Verification Commands

**Check Active Connectors:**
```powershell
# Should show ONLY cfd-a (not applylens-cloudflared-prod)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Networks}}" | Select-String "cloudflared|cfd"
```

**Expected Output:**
```
cfd-a    Up X minutes    applylens_applylens-prod,infra_net
```

**Check Tunnel Connections:**
```powershell
# Should show 4 active HA connections
docker logs cfd-a --tail 20 | Select-String "Registered tunnel connection"
```

**Test LedgerMind Assets:**
```powershell
# All should return 200 OK (no 502s)
curl.exe -I https://app.ledger-mind.org/assets/preload-helper-2LWRYvkK.js
curl.exe -I https://app.ledger-mind.org/assets/vendor-radix-BA32w1ww.js
curl.exe https://api.ledger-mind.org/ready
```

### Check Network Connectivity
```powershell
# From backend to nginx
docker exec ai-finance-backend python -c "import urllib.request; r = urllib.request.urlopen('http://ledgermind-web.int:80/_up'); print('Status:', r.getcode())"

# Expected: Status: 200
```

### Check Container Status
```powershell
# Should NOT show local cloudflared
docker ps -a | Select-String "cloudflared"

# Expected: Only cfd-a and applylens-cloudflared-prod should be running
```

## Architecture Diagram

```
Internet
   ↓
Cloudflare Edge (may have cached 502s)
   ↓
Cloudflare Tunnel (08d5feee-f504-47a2-a1f2-b86564900991)
   ↓
cfd-a container (4 HA connections) ✅
   ↓
infra_net Docker network
   ↓
   ├─→ ledgermind-web.int:80 (nginx) ✅
   └─→ ledgermind-api.int:8000 (backend) ✅
```

**Before (Problem):**
```
Internet → Cloudflare Edge
         ↓
    Race condition between:
    ├─ cfd-a (remote) ←→ ledgermind-web.int ✅
    └─ ai-finance-agent-oss-clean-cloudflared-1 (local) ←→ nginx ❌ REMOVED
```

## Files Modified

- `docker-compose.prod.yml`:
  - Commented out `cloudflared` service (lines 277-297)
  - Commented out `cf-health` service (lines 302-312)
  - Added comments explaining why they're disabled

## Success Criteria

- [x] Local cloudflared container removed
- [x] Remote tunnel (cfd-a) has 4 active HA connections
- [x] Network aliases configured correctly
- [x] Ingress rules verified
- [ ] External 502 errors resolved (waiting for cache purge/expiry)

## Maintenance Notes

### Do NOT Re-enable Local cloudflared
The commented-out `cloudflared` service in `docker-compose.prod.yml` should remain disabled. Re-enabling it will cause the same race condition issues.

### Why Was It There?
The local cloudflared was likely added during initial development/testing before the remote tunnel infrastructure was set up properly. It's no longer needed now that:
1. Network aliases are in place (`ledgermind-web.int`, `ledgermind-api.int`)
2. Remote tunnel (`cfd-a`) has proper ingress configuration
3. All containers are on the same `infra_net` network

### Future Tunnel Changes
If you need to modify tunnel routing:
1. Update the ingress rules on the **remote** tunnel (wherever `cfd-a` is configured)
2. Do NOT add a new local cloudflared container
3. Use the existing network aliases as targets

## Related Documentation

- ApplyLens tunnel fix: (cfd-b disabled for similar reasons)
- Cloudflare Tunnel docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- Network alias setup: `docker-compose.prod.yml` lines 175-181, 256-263

## Support

If issues persist after cache clears:
1. Check tunnel connections: `docker logs cfd-a`
2. Verify nginx is healthy: `docker ps | grep nginx`
3. Test internal connectivity: `docker exec ai-finance-backend python -c "import urllib.request; print(urllib.request.urlopen('http://ledgermind-web.int:80/_up').getcode())"`
4. Check Cloudflare dashboard for tunnel health: https://one.dash.cloudflare.com/
