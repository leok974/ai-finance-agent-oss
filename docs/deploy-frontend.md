# Frontend Deploy (Production)

**Source:** Vite/React SPA
**Deployed via:** Nginx container (multi-stage Docker build)

## Build & Ship

```powershell
pnpm -s build
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
docker --context desktop-linux compose $FILES build web
docker --context desktop-linux compose $FILES up -d web nginx
```

The SPA is copied into the nginx image under /usr/share/nginx/html.

There is no separate dev web server at runtime; nginx serves static files and proxies API.

## Cache Busting

Cloudflare → Caching → Purge Everything (or at least /index.html).

In the browser, hard refresh (Ctrl+F5). If a Service Worker exists, Unregister it
(DevTools → Application → Service Workers).

## Endpoint Primer

Do not prefix /agent/* or /ingest/* with /api.

Legacy /api/charts/* and /api/rules/suggestions* are removed.

Metrics alias: /api/metrics → 307 → /metrics.

## Quick Smoke
```powershell
curl -s -o NUL -w "READY %{{http_code}}\n" https://app.ledger-mind.org/ready
curl -s -o NUL -w "META %{{http_code}}\n"  https://app.ledger-mind.org/agent/tools/meta/latest_month
curl -s -o NUL -w "INGEST %{{http_code}}\n" -X OPTIONS https://app.ledger-mind.org/ingest/csv
```

---

## Post-patch commands (fast path)

```powershell
# Lint & typecheck (the new rule should only flag legacy code)
pnpm -s typecheck
pnpm -s lint

# Build
pnpm -s build

# Redeploy nginx SPA
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
docker --context desktop-linux compose $FILES build web
docker --context desktop-linux compose $FILES up -d web nginx

# Purge edge cache, then hard refresh in browser
```

## Verifications (what you should see)

* No network calls to /api/agent/*, /api/ingest/*, or /api/rules/suggestions*.
* CSV upload goes to POST /ingest/csv (returns 200/202 depending on handler).
* Charts call POST /agent/tools/charts/*.
* Suggestions panel shows “temporarily unavailable” without any data hooks firing.
* /api/metrics 307 → /metrics 200 (and HEAD OK if you added that alias earlier).
