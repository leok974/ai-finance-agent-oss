# Cloudflare Cache Configuration Fix

## Problem Identified
Cloudflare is serving **cached HTML with old bundle references**:
- **Cloudflare Edge**: `main-DCJyg88Y.js` (old, deleted bundle)
- **Nginx Origin**: `main-Chr9uN05.js` (current bundle)

This causes browser to execute stale code even after rebuilds.

## Root Cause
- Cloudflare caches both HTML and JS assets by default
- Our hash-based bundles change on every build (`main-*.js`)
- Cached `index.html` still references old bundle hash
- Cloudflare has cached the old bundle as well (404s now because origin deleted it)

## Solution: 3-Part Fix

### Part 1: Purge Everything (One-Time)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Select `ledger-mind.org`
2. Navigate to **Caching** → **Configuration**
3. Click **"Purge Everything"** button
4. Confirm the purge

**Verification**:
```powershell
# Should now show main-Chr9uN05.js (current bundle)
curl -s https://app.ledger-mind.org/ | Select-String "main-.*\.js"
```

### Part 2: Create Cache Rule for HTML (Bypass Cache)

**Purpose**: Never cache `index.html` so fresh bundle references are always served.

1. Go to **Rules** → **Cache Rules** → **Create rule**
2. **Rule name**: `No Cache HTML - app.ledger-mind.org`
3. **Expression**:
   ```
   (http.host eq "app.ledger-mind.org" and http.request.uri.path in {"/", "/index.html"})
   ```
4. **Then the cache status is**: `Bypass`
5. **Edge Cache TTL**: `Respect origin` (or set to `0`)
6. Click **Deploy**

### Part 3: Create Cache Rule for Assets (Long Cache)

**Purpose**: Aggressively cache hash-named assets (safe because hash changes = different file).

1. Go to **Rules** → **Cache Rules** → **Create rule**
2. **Rule name**: `Long Cache Assets - app.ledger-mind.org`
3. **Expression**:
   ```
   (http.host eq "app.ledger-mind.org" and starts_with(http.request.uri.path, "/assets/"))
   ```
4. **Then the cache status is**: `Eligible for cache`
5. **Edge Cache TTL**: `1 month` (or `1 year` - assets are hash-named)
6. **Browser Cache TTL**: `1 month`
7. Click **Deploy**

## Alternative: API-Based Purge

If you have Cloudflare API credentials:

```powershell
# Get Zone ID
$ZONE_ID = "your-zone-id"
$API_TOKEN = "your-api-token"

# Purge everything
Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $API_TOKEN"
    "Content-Type" = "application/json"
  } `
  -Body '{"purge_everything":true}'

# Or purge specific files
Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $API_TOKEN"
    "Content-Type" = "application/json"
  } `
  -Body '{
    "files": [
      "https://app.ledger-mind.org/",
      "https://app.ledger-mind.org/index.html",
      "https://app.ledger-mind.org/assets/main-DCJyg88Y.js"
    ]
  }'
```

## Verification Steps

After purge + cache rules:

1. **Check HTML from edge**:
   ```powershell
   curl -s https://app.ledger-mind.org/ | Select-String "main-.*\.js"
   # Expected: main-Chr9uN05.js
   ```

2. **Check cache headers**:
   ```powershell
   curl -I https://app.ledger-mind.org/
   # Should see: cf-cache-status: BYPASS or DYNAMIC

   curl -I https://app.ledger-mind.org/assets/main-Chr9uN05.js
   # Should see: cf-cache-status: HIT or MISS (will be HIT on second request)
   # Should see: cache-control: public, max-age=31536000
   ```

3. **Run debug E2E test**:
   ```powershell
   cd C:\ai-finance-agent-oss-clean\apps\web
   $env:IS_PROD='true'
   $env:PW_SKIP_WS='1'
   $env:BASE_URL='https://app.ledger-mind.org'
   pnpm exec playwright test tests/e2e/debug-chatdock-mount.spec.ts --project=chromium-prod --reporter=line
   ```

   **Expected console logs**:
   - ✅ `[ChatDock] ✅ MOUNTED` (new debug log)
   - ❌ NO `[App] chat mount effect` (old iframe code)
   - ✅ Bundle loaded: `main-Chr9uN05.js` (not `main-DCJyg88Y.js`)

## Current State

**Confirmed Issues**:
- ✅ Cloudflare serving cached HTML with old bundle reference
- ✅ Old bundle `main-DCJyg88Y.js` doesn't exist on origin (404)
- ✅ New bundle `main-Chr9uN05.js` exists on origin
- ✅ No Service Worker in codebase (ruled out app-level caching)

**Next Actions Required** (Manual - Dashboard Access Needed):
1. Purge Cloudflare cache (one-time)
2. Create HTML bypass rule (permanent)
3. Create assets long-cache rule (permanent)

**Safeguards Added**:
- ✅ Playwright config now disables Service Workers in prod tests
- ✅ This document for future reference

## Future Prevention

Once cache rules are in place:

1. **HTML will never be cached** → Always get fresh bundle references
2. **Assets will be cached forever** → Fast loads, but hash changes = new file
3. **No more manual purges needed** → Deploy works automatically

## Reference

- Current bundle on origin: `main-Chr9uN05.js`
- Stale bundle in CF cache: `main-DCJyg88Y.js`
- Account Tag: `433c0aebd5734302744ffa982821956e`
- Tunnel ID: `08d5feee-f504-47a2-a1f2-b86564900991`
- Domain: `app.ledger-mind.org`
