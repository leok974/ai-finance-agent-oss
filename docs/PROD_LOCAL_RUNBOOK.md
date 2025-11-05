# Prod-Local Runbook (Windows / PowerShell)

Canonical local edge port: **80**. The legacy 8080 mapping has been retired; the auto-detection script remains for resilience and to surface accidental extra nginx stacks. CI enforces a single nginx container and port 80.

## Steps (Auto Port Detection)

Normally the edge binds port 80. The helper script still checks 80/8080 and fails (in strict mode) if more than one nginx is present. Use it if you're unsure or scripting portable tooling.

```powershell
# 0) Stop any dev stack (avoid 5432 / 8000 conflicts)
docker ps --format "table {{.Names}}\t{{.Ports}}" | findstr /i "dev" ; `
  docker stop ledgermind-dev-postgres-1,ledgermind-dev-backend-1 2>$null

# 1) Re-render CSP (safe even with zero inline scripts)
pnpm run csp:hash

# 2) Build & start prod-local nginx (and the rest if needed)
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')

docker --context desktop-linux compose $FILES build nginx
docker --context desktop-linux compose $FILES up -d nginx

# (optional) bring up the whole stack if not already running
docker --context desktop-linux compose $FILES up -d

# 3) Detect active edge port (should return 80). Warns if multiple nginx containers.
$EDGE_PORT = powershell -NoProfile -ExecutionPolicy Bypass -File scripts/edge-port.ps1 -VerboseWarn
Write-Host "Using EDGE_PORT=$EDGE_PORT"

# 4) Quick health & headers (local)
curl.exe -s -o NUL -w "READY %{http_code}`n"  http://127.0.0.1:$EDGE_PORT/ready
curl.exe -sI http://127.0.0.1:$EDGE_PORT/ | findstr /i "content-security-policy"
curl.exe -sI http://127.0.0.1:$EDGE_PORT/ | findstr /i "referrer-policy"
curl.exe -sI http://127.0.0.1:$EDGE_PORT/ | findstr /i "permissions-policy"

# 5) Back-compat alias for /api/metrics (expect 307 Location: /metrics)
curl.exe -sI http://127.0.0.1:$EDGE_PORT/api/metrics | findstr /i "HTTP/1.1 307"
curl.exe -sI http://127.0.0.1:$EDGE_PORT/api/metrics | findstr /i "location:"

# 6) Core routes behind nginx → backend
curl.exe -s -o NUL -w "HEALTHZ %{http_code}`n" http://127.0.0.1:$EDGE_PORT/api/healthz
curl.exe -s -o NUL -w "READY   %{http_code}`n" http://127.0.0.1:$EDGE_PORT/ready
curl.exe -s -o NUL -w "METRIC  %{http_code}`n" http://127.0.0.1:$EDGE_PORT/metrics

# 7) Frontend agent tools sanity (adjust if auth required)
curl.exe -s -o NUL -w "META %{http_code}`n"  http://127.0.0.1:$EDGE_PORT/agent/tools/meta/latest_month
curl.exe -s -o NUL -w "ING  %{http_code}`n"  -X OPTIONS http://127.0.0.1:$EDGE_PORT/ingest/csv
```

## Expected Results

- READY 200, HEALTHZ 200
- CSP header present, no `__INLINE_SCRIPT_HASHES__` literal, contains `script-src 'self'` and `style-src 'self'`.
- `/api/metrics` → HTTP/1.1 307 with `Location: /metrics` (on the auto-detected port)
- `/metrics` returns 200 (Prometheus exposition or similar)
- `META 200` (if public); `ING 204/200` (CORS preflight) depending on configuration.

## Handy Tails

```powershell
# nginx logs (primary stack only — CI fails if more than one nginx exists)
docker logs -f ai-finance-agent-oss-clean-nginx-1

# backend logs (find exact container id/name first)
docker ps --format "table {{.Names}}\t{{.Image}}" | findstr /i "backend"
docker logs -f ai-finance-agent-oss-clean-backend-1
```

## Common Gotchas & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| CSP shows placeholder | Hash render not run before build | Re-run `pnpm run csp:hash` then rebuild nginx |
| 404 on /api/agent or /api/ingest | Legacy /api/* prefix removed | Call root `/agent/*` or `/ingest/*` paths |
| 308 / 403 Cloudflare challenge (prod) | Edge protection | Use local 127.0.0.1 or add proper headers / follow redirects |
| Port collisions (5432/8000) | Dev stack still running | Stop dev containers before prod-local |
| Styles missing after tightening | Runtime style injection | Add nonce-based allowance or revert specific injection mechanism |

## Incident Quick Reference

If CSP unexpectedly breaks scripts:
1. Inspect violation reports (Report-To group `csp`).
2. Compare `deploy/nginx.conf` vs `deploy/nginx.conf.rendered`.
3. Re-run render if placeholder accidentally reintroduced.
4. Only as last resort, temporarily (locally) add a nonce or limited `'unsafe-inline'` (do **not** commit long-term workaround without root cause).

## Cleanup

```powershell
docker --context desktop-linux compose $FILES down
```
