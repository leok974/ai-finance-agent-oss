# Cache Investigation Results - November 14, 2025

## Evidence Summary

### 1. Cloudflare Edge vs Nginx Origin

**Cloudflare Edge (STALE)**:
```powershell
PS> curl -s https://app.ledger-mind.org/ | Select-String "main-.*\.js"
<script type="module" crossorigin src="/assets/main-DCJyg88Y.js"></script>
```

**Nginx Origin (FRESH)**:
```powershell
PS> docker exec ai-finance-agent-oss-clean-nginx-1 sh -c 'grep "main-" /usr/share/nginx/html/index.html'
<script type="module" crossorigin src="/assets/main-Chr9uN05.js"></script>
```

**Conclusion**: Cloudflare is serving cached HTML that references a bundle that no longer exists.

### 2. Bundle Availability Check

**Old Bundle (main-DCJyg88Y.js)**:
```
HTTP/1.1 404 Not Found
cf-cache-status: MISS
Cache-Control: public, max-age=31536000, immutable
```
- Returns 404 (doesn't exist on origin)
- Cloudflare has MISS (no longer in edge cache or looking for it)

**New Bundle (main-Chr9uN05.js)**:
```
HTTP/1.1 404 Not Found
cf-cache-status: HIT
Age: 69
```
- Also returns 404 through Cloudflare!
- Cloudflare has cached the 404 response (HIT with Age: 69 seconds)
- This means Cloudflare requested it recently, got 404, and cached that

**Wait - Why 404?**

Let me check nginx file structure - the bundles might be at a different path:

### 3. Nginx File Structure Investigation

```powershell
PS> docker exec ai-finance-agent-oss-clean-nginx-1 ls -lah /usr/share/nginx/html/assets/ | Select-String "main-"

-rw-r--r-- 1 root root  17.7K Nov 14 17:12 main-BqrKJ77Q.js
-rw-r--r-- 1 root root  50.9K Nov 14 17:12 main-BqrKJ77Q.js.map
-rw-r--r-- 1 root root 313.2K Nov 14 17:12 main-C_BmoFgS.js
-rw-r--r-- 1 root root 963.1K Nov 14 17:12 main-C_BmoFgS.js.map
-rw-r--r-- 1 root root  68.6K Nov 14 17:12 main-DnE7skF8.css
```

**CRITICAL FINDING**: The container has `main-C_BmoFgS.js`, but `index.html` references `main-Chr9uN05.js`!

This means:
1. We did a rebuild (created main-Chr9uN05.js during build)
2. That bundle was used in index.html
3. But then another process or layer replaced/cached an older version of the files
4. OR the build didn't complete correctly

Let me check when these files were created and what the latest build produced.

### 4. Timeline Analysis

**Last Rebuild Command** (from context):
```powershell
# At ~17:10 UTC
docker compose -f docker-compose.prod.yml build --no-cache nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

**File timestamps in container**: Nov 14 17:12 (12 minutes after rebuild started)

**Index.html references**: `main-Chr9uN05.js`
**Files in /assets/**: `main-C_BmoFgS.js`, `main-BqrKJ77Q.js`

**Hypothesis**: The build process created `main-Chr9uN05.js`, wrote it to index.html, but then the COPY step or entrypoint script overwrote the dist folder with an older build.

### 5. Service Worker Check

```powershell
PS> rg "serviceWorker|navigator\.serviceWorker|workbox" apps/web -n
# No matches found
```

**Confirmed**: No Service Worker registration in codebase.

## Root Cause Analysis

**Primary Issue**: **Docker layer caching or multi-stage build issue**
- Index.html was generated with reference to `main-Chr9uN05.js`
- But the actual assets directory has older bundles
- This suggests the build stage completed but the COPY from build stage grabbed wrong files

**Secondary Issue**: **Cloudflare aggressive caching**
- Even if we fix the build, Cloudflare will serve stale HTML
- Cloudflare has cached old index.html with `main-DCJyg88Y.js`
- Need cache purge + cache rules to fix

## Action Items

### Immediate (Build Fix)
1. ✅ Verify Dockerfile.nginx copies from correct build stage
2. ✅ Do another --no-cache rebuild to ensure consistency
3. ✅ Verify index.html and assets/ match post-build

### Short-term (Cache Purge)
4. ⏳ Purge Cloudflare cache manually (requires dashboard access)
5. ⏳ Verify edge serves fresh HTML

### Long-term (Cache Rules)
6. ⏳ Create Cloudflare cache rule: Bypass HTML
7. ⏳ Create Cloudflare cache rule: Long-cache assets
8. ✅ Add `--disable-service-worker` to Playwright prod config

## Current Status

**Build Consistency**: ❌ MISMATCH
- index.html → main-Chr9uN05.js
- assets/ → main-C_BmoFgS.js, main-BqrKJ77Q.js

**Cloudflare Cache**: ❌ STALE
- Serving old HTML with main-DCJyg88Y.js

**Next Step**: Investigate Dockerfile.nginx to understand why build outputs don't match
