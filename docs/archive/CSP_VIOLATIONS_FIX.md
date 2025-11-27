# CSP Violations Fix

## Problem Analysis

User reported two CSP violations in the browser console:

1. **"Refused to execute inline script"** - CSP blocking inline JavaScript
2. **"Refused to connect to 'http://app.ledger-mind.org/healthz'"** - Mixed content violation (http on https page)

## Root Cause

The frontend was being built with `VITE_API_BASE=http://127.0.0.1:8000` from `apps/web/.env` (intended for local development), but this value was being baked into the production Docker build.

According to the Copilot project instructions:
- In production, `VITE_API_BASE` should be `/api` (relative path, not absolute URL)
- All API calls should use relative paths and go through the `fetchJSON()` helper from `src/lib/http.ts`
- Nginx proxy handles the `/api/*` routing to the backend service

### Investigation Results

1. ✅ **HTML Source Clean**: `apps/web/index.html` contains NO inline scripts
   - Only external module: `<script type="module" src="/src/main.tsx"></script>`
   - CSP meta tag removed (enforced via nginx headers)

2. ✅ **No Dynamic Script Creation**: Code search found no patterns like:
   - `createElement('script')`
   - `innerHTML = '<script>'`
   - Dynamic script injection

3. ✅ **No Hardcoded http:// URLs**: Frontend source has no hardcoded `http://app.ledger-mind.org` URLs
   - All API calls use relative paths: `'healthz'`, `'llm/health'`, `'rules'`, etc.
   - All go through `fetchJSON()` helper

4. ❌ **Build Configuration Issue**: Docker build was NOT setting `VITE_API_BASE`
   - Missing from `docker-compose.prod.yml` build args
   - Missing from `deploy/Dockerfile.nginx` ARG declarations
   - Vite fallback to `apps/web/.env` value: `http://127.0.0.1:8000`

## Solution

### 1. Fix Docker Compose Build Args

**File**: `docker-compose.prod.yml`

Added `VITE_API_BASE` build arg (defaults to `/api`):

```yaml
nginx:
  build:
    args:
      VITE_API_BASE: ${VITE_API_BASE:-/api}  # NEW
      VITE_SUGGESTIONS_ENABLED: ${VITE_SUGGESTIONS_ENABLED:-1}
      # ... other args
```

### 2. Fix Dockerfile ARG and ENV

**File**: `deploy/Dockerfile.nginx`

Added `VITE_API_BASE` to ARG declarations and ENV setup:

```dockerfile
## Build metadata args (injected by outer build):
ARG VITE_API_BASE=/api  # NEW
ARG VITE_SUGGESTIONS_ENABLED=0
# ... other args

ENV VITE_API_BASE=${VITE_API_BASE} \  # NEW
    VITE_SUGGESTIONS_ENABLED=${VITE_SUGGESTIONS_ENABLED} \
    # ... other env vars
```

### 3. CSP Headers Already Correct

**File**: `nginx/conf.d/security-headers.conf`

CSP `connect-src` already correctly allows only HTTPS:
```properties
connect-src 'self' https://app.ledger-mind.org https://api.ledger-mind.org wss://app.ledger-mind.org wss://api.ledger-mind.org https://static.cloudflareinsights.com https://cloudflareinsights.com;
```

No `http://` origins are allowed, which is correct. The issue was that the app was trying to use `http://` due to the incorrect build-time configuration.

## Verification

After rebuilding and redeploying:

```bash
# Rebuild nginx container with correct VITE_API_BASE
docker compose -f docker-compose.prod.yml build nginx

# Restart nginx
docker compose -f docker-compose.prod.yml up -d nginx

# Verify built assets use /api (not http://127.0.0.1:8000)
docker exec ai-finance-agent-oss-clean-nginx-1 grep -r "127.0.0.1:8000" /usr/share/nginx/html/assets/
# Should return: no matches

# Verify CSP headers
curl -I https://app.ledger-mind.org/ | grep -i content-security-policy
```

## Expected Behavior

After the fix:
- ✅ API calls use relative paths: `/api/healthz`, `/api/rules`, etc.
- ✅ CSP `connect-src` allows these (via `'self'`)
- ✅ No mixed content warnings (no http:// on https:// page)
- ✅ Inline script violation should not occur (HTML has no inline scripts)

## Inline Script CSP Violation

The "Refused to execute inline script" violation may be:
1. **False positive**: Browser extension injecting scripts
2. **Hash mismatch**: If Vite injects inline scripts during build, nginx entrypoint script should hash them
3. **Cloudflare Analytics**: The CSP already allows `https://static.cloudflareinsights.com` for script-src

To investigate further if the violation persists:
1. Test in incognito mode (no extensions)
2. Check browser console for specific script SHA-256 hash
3. Verify nginx entrypoint script ran: `docker logs ai-finance-agent-oss-clean-nginx-1 | grep csp`

## Files Modified

1. `docker-compose.prod.yml` - Added `VITE_API_BASE` build arg
2. `deploy/Dockerfile.nginx` - Added `VITE_API_BASE` ARG and ENV

## Related Documentation

- **Copilot Instructions**: `.github/copilot-instructions.md`
  - "Do NOT hardcode `/api/` in new code except for `/api/auth/*` endpoints"
  - "All non‑auth API calls use relative paths like `rules`, `rules/{id}`"
  - "Respect `VITE_API_BASE` (defaults to `/`)"

- **API Client**: `apps/web/src/lib/http.ts`
  - Line 14: `export const BASE = (env.VITE_API_BASE || '/api').replace(/\/$/, '');`
  - All API calls go through `fetchJSON(path, opts)` which applies BASE prefix

## Deployment Impact

- **Breaking Change**: No
- **Requires Rebuild**: Yes (nginx container)
- **Requires Data Migration**: No
- **Downtime**: Minimal (~10-15 seconds for nginx restart)

## Testing Checklist

- [x] Rebuild nginx container
- [x] Verify no `127.0.0.1:8000` in built assets
- [ ] Access https://app.ledger-mind.org/ in browser
- [ ] Open browser console and check for CSP violations
- [ ] Verify `/api/healthz` endpoint works (200 OK)
- [ ] Verify charts load correctly
- [ ] Test login flow
- [ ] Test CSV upload and data refresh

## Commit Message

```
fix(docker): set VITE_API_BASE=/api for production nginx build

The frontend was incorrectly using VITE_API_BASE=http://127.0.0.1:8000
from apps/web/.env (dev config) in production builds, causing:
- CSP connect-src violations (http:// on https:// page)
- Mixed content warnings

Now explicitly set VITE_API_BASE=/api in docker-compose.prod.yml
and Dockerfile.nginx to ensure proper relative API paths.

Fixes: CSP violations reported in console
Related: .github/copilot-instructions.md API path rules
```

## References

- CSP Spec: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- Vite Environment Variables: https://vitejs.dev/guide/env-and-mode.html
- Nginx CSP Hashing: `nginx/entrypoint.d/10-csp-inline-hashes.sh`
