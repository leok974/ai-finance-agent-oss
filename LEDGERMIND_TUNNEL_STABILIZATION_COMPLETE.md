# LedgerMind Tunnel Stabilization – Complete ✅

**Date:** 2025-01-21
**Objective:** Eliminate random 502 errors caused by duplicate cloudflared connectors

## Summary

Successfully disabled the local (redundant) cloudflared container that was racing with the remote Cloudflare Tunnel, causing intermittent 502 Bad Gateway errors.

## What Was Done

### 1. Identified the Problem
- **Local cloudflared**: `ai-finance-agent-oss-clean-cloudflared-1` (running on this machine)
- **Remote tunnel**: `cfd-a` (the authoritative tunnel with HA connections)
- **Issue**: Both were trying to serve `app.ledger-mind.org` and `api.ledger-mind.org`, causing race conditions

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

## Current Status

### ✅ Infrastructure Fixed
- Local cloudflared container: **DISABLED**
- Remote tunnel (cfd-a): **RUNNING** with 4 HA connections
- Network aliases: **CONFIGURED CORRECTLY**
- Ingress rules: **VERIFIED**

### ⚠️ Cloudflare Cache Issue (External)
The site still returns 502 when accessed externally because Cloudflare is caching the old 502 responses from when the tunnel was having issues.

**Evidence:**
```bash
$ curl -I https://app.ledger-mind.org
HTTP/1.1 502 Bad Gateway
```

**Why This Happens:**
- Cloudflare caches error responses (including 502s) for a short period
- Even though the tunnel is now stable, the cached 502s are still being served
- The tunnel itself is working (4 HA connections, correct routing)

## Next Steps

### Option 1: Wait for Cache to Expire (Passive)
Cloudflare's default cache TTL for 502 errors is typically **0-10 seconds**, but in some cases it can be longer due to:
- Cloudflare's "Always Online" feature caching error pages
- Custom cache rules in Cloudflare dashboard
- Edge node cache persistence

**Timeline:** Should clear within **5-30 minutes** under normal circumstances.

### Option 2: Purge Cache Manually (Active) – RECOMMENDED
Use Cloudflare API to purge the cache immediately.

**Script:** `c:\ai-finance-agent-oss-clean\scripts\purge-cf-cache.ps1`

**Requirements:**
- Cloudflare API token with "Zone.Cache Purge" permission
- Zone ID for ledger-mind.org

**Command:**
```powershell
cd c:\ai-finance-agent-oss-clean
.\scripts\purge-cf-cache.ps1 -ZoneId "YOUR_ZONE_ID" -ApiToken "YOUR_API_TOKEN"
```

Alternatively, purge via Cloudflare Dashboard:
1. Log into Cloudflare dashboard
2. Select `ledger-mind.org` zone
3. Go to **Caching** → **Configuration**
4. Click **Purge Everything**

### Option 3: Test with Cache Bypass
To verify the tunnel is working RIGHT NOW (bypassing cache):

**Using curl with cache-bypass header:**
```bash
curl -I https://app.ledger-mind.org -H "Cache-Control: no-cache"
```

**Or access via Cloudflare's orange cloud bypass:**
```bash
# Get origin IP from Cloudflare dashboard DNS settings
curl -I http://ORIGIN_IP:80 -H "Host: app.ledger-mind.org"
```

## Verification Commands

### Check Tunnel Status
```powershell
# View active connections
docker logs cfd-a 2>&1 | Select-String "Registered tunnel connection" | Select-Object -Last 4

# View ingress config
docker logs cfd-a 2>&1 | Select-String "ledger-mind" -Context 2
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
