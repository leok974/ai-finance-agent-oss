# Tunnel Network Configuration Fix

**Date**: November 15, 2025
**Issue**: 502 Bad Gateway on `app.ledger-mind.org` via Cloudflare
**Root Cause**: `infra-cloudflared` container not attached to `infra_net` Docker network

## Problem

The `infra-cloudflared` container (which handles public Cloudflare tunnel traffic) was only attached to:
- `infra_default`
- `applylens_applylens-prod`

**Missing**: `infra_net` — the network where LedgerMind services are aliased:
- `ledgermind-web.int:80` (nginx)
- `ledgermind-api.int:8000` (backend)

**Result**: Cloudflare tunnel could not resolve these hostnames → returned 502 Bad Gateway to users.

## Temporary Fix (Applied)

```bash
docker network connect infra_net infra-cloudflared
```

**⚠️ WARNING**: This fix is **NOT persistent**. It will be lost if:
- Container is recreated (`docker compose down && docker compose up`)
- Container restarts
- System reboots

## Permanent Fix (Required)

Edit `D:\ApplyLens\infra\docker-compose.yml` to add `infra_net` to the `infra-cloudflared` service:

```yaml
services:
  infra-cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: infra-cloudflared
    # ... existing command, volumes, etc ...
    networks:
      - infra_net              # ✅ ADD THIS - needed for LedgerMind routing
      - infra_default          # existing
      - applylens_applylens-prod  # existing (if present)
    # ... rest of config ...

networks:
  infra_net:
    external: true
  infra_default:
    # ... existing config ...
  applylens_applylens-prod:
    external: true
```

### After Editing

```bash
# Navigate to the infra compose directory
cd D:\ApplyLens\infra

# Recreate the container with new network configuration
docker compose up -d infra-cloudflared

# Verify it's on infra_net
docker network inspect infra_net --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}' | findstr infra-cloudflared
```

Expected output:
```
infra-cloudflared: 172.23.0.X/16
```

## Verification

Run the health check script:

```powershell
pwsh scripts/lm-health.ps1
```

Expected output (first check):
```
== Tunnel Network Configuration ==
✅ infra-cloudflared IS on infra_net (can reach ledgermind-web.int)
```

Also test manually:
```bash
# Should return 200 OK with JSON health data
curl https://app.ledger-mind.org/healthz

# Should return 401 Unauthorized (correct - no credentials)
curl https://app.ledger-mind.org/api/auth/me
```

## Cloudflare Dashboard Routes

**Tunnel ID**: `08d5feee-f504-47a2-a1f2-b86564900991`

The following routes are configured in Cloudflare Zero Trust dashboard and **do NOT need to be changed**:

| Hostname | Service | Container Alias |
|----------|---------|----------------|
| `app.ledger-mind.org` | `http://ledgermind-web.int:80` | nginx |
| `api.ledger-mind.org` | `http://ledgermind-api.int:8000` | backend |

**Key Point**: These `.int` hostnames are Docker network aliases defined in `docker-compose.prod.yml`. The tunnel must be on `infra_net` to resolve them via Docker's embedded DNS.

## E2E Tests

After applying the fix, all E2E tests should pass:

```powershell
cd apps/web
$env:IS_PROD='true'
$env:PW_SKIP_WS='1'
$env:BASE_URL='https://app.ledger-mind.org'
pnpm exec playwright test tests/e2e/chat-launcher-anim.spec.ts tests/e2e/chat-panel-layout.spec.ts --project=chromium-prod --reporter=line
```

Expected: `6 passed`

## Related Documentation

- `SHARED_TUNNEL_CONNECTOR_NOTES.md` - Comprehensive tunnel configuration guide
- `scripts/lm-health.ps1` - Automated health check (now includes tunnel network check)
- `docker-compose.prod.yml` - LedgerMind stack (defines `infra_net` network)

## Technical Details

**Why This Matters**:
- Docker's embedded DNS server (127.0.0.11:53) only resolves aliases for networks a container is attached to
- `infra-cloudflared` receives HTTPS requests from Cloudflare edge → needs to proxy to `ledgermind-web.int:80`
- Without being on `infra_net`, DNS lookup fails → connection refused → 502 Bad Gateway
- The error in logs: `dial tcp: lookup ledgermind-web.int on 127.0.0.11:53: no such host`

**Network Architecture**:
```
Internet
  ↓
Cloudflare Edge (TLS termination)
  ↓
infra-cloudflared (on infra_net)
  ↓ HTTP
ledgermind-web.int:80 (nginx on infra_net)
  ↓ HTTP
ledgermind-api.int:8000 (backend on infra_net)
```

All three must be on the same Docker network for DNS resolution to work.

## Status

**Current State**: ✅ Working (temporary fix applied)
**Action Required**: ⚠️ Edit `D:\ApplyLens\infra\docker-compose.yml` to make permanent
**Verified By**: E2E tests passing (6/6), health check script, manual curl tests
**Impact if Not Fixed**: Next time `infra-cloudflared` restarts → 502 errors return
