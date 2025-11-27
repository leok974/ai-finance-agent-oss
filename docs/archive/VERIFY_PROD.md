# Production Verification Checklist

Purpose: Repeatable steps to validate external readiness, crypto status, model / LLM availability, and tunnel integrity after any deployment or network change.

## 1. External Probes

```
# Ready endpoint (expects crypto + kms mode)
curl -s -o /dev/null -w "READY %{{http_code}}\n" https://app.ledger-mind.org/ready
# ✅ Expect: READY 200 (body contains {"ok":true,"crypto_ready":true,"mode":"kms"})

# Healthz (DB + migrations + models proxy)
curl -s -o /dev/null -w "HEALTHZ %{{http_code}}\n" https://app.ledger-mind.org/api/healthz
# ✅ Expect: HEALTHZ 200

# Models
curl -s https://app.ledger-mind.org/agent/models | jq 'length'
# ✅ Expect: >= 1 (unless intentionally operating without primary + fallback)

# LLM Health
curl -s -o /dev/null -w "LLM_HEALTH %{{http_code}}\n" https://app.ledger-mind.org/llm/health
# ✅ Expect: LLM_HEALTH 200
```

Browser: Open https://app.ledger-mind.org and confirm SPA loads, dashboard/API calls succeed (DevTools Network: no 502/499).

## 2. Internal (Container Network)

```
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
## Backend readiness via nginx container namespace
docker --context desktop-linux compose $FILES exec nginx \
  sh -lc "curl -s -o /dev/null -w 'INTERNAL_READY %{{http_code}}\n' http://backend:8000/ready"  # ✅ Expect: INTERNAL_READY 200

# Crypto status direct CLI
docker --context desktop-linux compose $FILES exec backend \
  python -m app.cli crypto-status  # Expect: {"mode":"kms","label":"active",...}

# Cloudflared recent logs (tail 60)
docker --context desktop-linux compose $FILES logs cloudflared --tail=60 | grep -E "service:\\"http://nginx:80\\"" || echo "❌ origin mismatch"
# ✅ Expect: service:"http://nginx:80" present & no recurring 'origin 502' lines
```

## 3. LLM / Model Health (Frontend Console)
Open browser DevTools Console after load:
1. Initial log showing modelsOk (from llmStore) should be true (✅) if at least one model is active.
2. Trigger a chat/help interaction; expect 200 on /agent/chat calls (✅) and response payload.

## 4. Common Failure Signatures & Causes
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 502 on /ready externally, but internal curl 200 | Cloudflared pointing to https://nginx:443 while nginx only on port 80 | Update cloudflared ingress to http://nginx:80 (already fixed) |
| connect() failed (111) in nginx logs | Backend just restarted or stale upstream IP during container replace | Wait 2-3s or ensure backend health passes before traffic (depends_on + healthcheck) |
| Repeated QUIC timeout / datagram manager failures | Transient network or local UDP buffer limits | Usually harmless; ensure at least one Registered tunnel connection is active |
| SPA loads but API 502 | Wrong Host header / origin mismatch after Cloudflare rule | Verify ingress hostname and proxy_pass Host header settings |

## 5. Optional Hardening / Enhancements
Already applied in `cloudflared/config.yml`:
```
originRequest:
  connectTimeout: 10s
  tcpKeepAlive: 30s
  noHappyEyeballs: true
```
Consider adding (if latency spikes):
```
originRequest:
  keepAliveTimeout: 60s
  disableChunkedEncoding: true
```

## 6. Post-Change Regression Guard
After modifying nginx or cloudflared config:
1. Recreate affected service: `docker compose up -d cloudflared` (and nginx if config changed).
2. Re-run all Section 1 & 2 probes.
3. Capture a dated log snippet (store if performing release checklist).

## 7. Crypto Rotation Sanity (When rotating KEK)
```
# Before rotation snapshot
python -m app.cli crypto-status
# Rotate (custom op) then verify new wrapped key label updates and wlen persists
python -m app.cli crypto-status
```
Expect mode stays `kms` and label changes if versioned.

## 8. Quick One-Liner Full Smoke
```
for u in /ready /api/healthz /api/openapi.json; do echo "=== $u"; curl -fsS https://app.ledger-mind.org$u | head -c 180; echo; done
```
Expect no errors and JSON/truncated spec for openapi.

## 9. Automated Smoke Scripts

You can run a minimal scripted check instead of manual curls:

Bash (Linux/macOS/WLS / container host):
```
./scripts/smoke.sh https://app.ledger-mind.org
```

PowerShell (Windows):
```
pwsh ./scripts/smoke.ps1 -BaseUrl https://app.ledger-mind.org
```

Exit code 0 = success. Non‑zero indicates at least one failed probe or missing `mode:"kms"`.

## 10. Deploy Checklist Reference
For structured pre/post steps see: [DEPLOY_CHECKLIST](DEPLOY_CHECKLIST.md)

---
Maintainer Note: If you see the HTTPS origin lines reappear in `cloudflared/config.yml`, re-apply the diff from commit enabling http://nginx:80 to prevent 502 regressions.

## 11. Analytics Verification (Events & Metrics)

### Flags
Ensure production build includes:
```
VITE_SUGGESTIONS_ENABLED=1
VITE_ANALYTICS_ENABLED=1
# Optional sampling (0-100)
# VITE_ANALYTICS_SAMPLE_PCT=50
```

### Event POST
```
curl -s -o /dev/null -w "HTTP%{http_code}\n" \
  -X POST https://app.ledger-mind.org/agent/analytics/event \
  -H "content-type: application/json" \
  -d '{"event":"smoke","props":{"k":"v"}}'
```
Expect: `HTTP204`.

### Metrics Increment
```
curl -s https://app.ledger-mind.org/metrics | Select-String analytics_events_total
```
Confirm `analytics_events_total{event="smoke"}` count increases (may need two posts).

### Oversized Rejection (16KiB cap)
```
python - <<'PY'
import requests, json
blob = 'x' * (17*1024)
r = requests.post('https://app.ledger-mind.org/agent/analytics/event', json={'event':'big','props':{'blob':blob}})
print('oversize status', r.status_code)
PY
```
Expect: 413.

### PromQL Starters
```
sum(increase(analytics_events_total[24h])) by (event)
histogram_quantile(0.95, sum by (le) (increase(analytics_event_size_bytes_bucket[1d])))
sum(increase(analytics_events_total{event="suggestion_create_success"}[1h]))
  / ignoring(event)
  sum(increase(analytics_events_total{event="suggestion_create_attempt"}[1h]))
```

### Sampling Note
If `VITE_ANALYTICS_SAMPLE_PCT < 100`, adjust expectations proportionally when comparing attempt vs. success counts.
