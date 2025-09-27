# OPERATIONS (Day-2)

Operational runbook for routine maintenance, diagnostics, and recovery.

## 1. Container Management
| Task | Command (Linux/macOS) | PowerShell |
|------|-----------------------|-----------|
| List services | `docker compose ps` | `docker compose ps` |
| Restart backend | `docker compose restart backend` | Same |
| Recreate cloudflared | `docker compose up -d cloudflared` | Same |
| Tail logs (backend) | `docker compose logs -f backend` | Same |
| Tail logs (nginx) | `docker compose logs -f nginx` | Same |
| Tail logs (cloudflared) | `docker compose logs -f cloudflared` | Same |

## 2. Key Health Endpoints
| Endpoint | Purpose | Expectation |
|----------|---------|-------------|
| `/ready` | Aggregated readiness | `200` + `ok:true` |
| `/api/healthz` | Basic service health | `200` |
| `/agent/models` | Model list | ≥1 model (prod) |
| `/llm/health` | LLM runtime ping | 200 (while runtime active) |
| `/api/crypto-status` | Encryption mode | `mode:"kms"` (prod) or `disabled` (dev) |

## 3. Quick PowerShell One-Liners
```powershell
# External readiness
Invoke-RestMethod https://app.ledger-mind.org/ready | ConvertTo-Json -Depth 3

# Internal via nginx container
$files = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
 docker --context desktop-linux compose $files exec nginx sh -lc "curl -s http://backend:8000/ready"

# Model count
(Invoke-RestMethod https://app.ledger-mind.org/agent/models).Length
```

## 4. Migrations
Apply (inside backend container or local venv):
```
alembic upgrade head
```
Check latest month after ingest:
```
psql -U <user> -d finance -c "SELECT MAX(date), month FROM transactions GROUP BY month ORDER BY month DESC LIMIT 3;"
```

## 5. KMS Key Rotation (High-Level)
1. Create new key version in GCP KMS.
2. Restart backend (unwrap uses latest primary version automatically if aliasing used).
3. Rewrap existing DEK if design calls for rotation script (future enhancement).
4. Verify `crypto-status` label / version fields.

See: [CRYPTO_SETUP](CRYPTO_SETUP.md)

## 6. Tunnel Diagnostics
| Symptom | Check | Command | Action |
|---------|-------|---------|--------|
| External 502, internal 200 | Origin mismatch | Inspect `cloudflared/config.yml` | Ensure `http://nginx:80` |
| QUIC errors spam | Transport fallback | Logs show repeated QUIC reset | Set protocol to http2 if persistent |
| High latency | Edge path | Trace via `curl -w` timing | Consider regional routing / caching |

### Cloudflared / Edge Notes (Operational Gotchas)
* Container state `Created` means it never actually started—rerun: `docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d cloudflared`.
* On Windows PowerShell, `curl` (alias to Invoke-WebRequest / or native curl using Schannel) can error with `CRYPT_E_NO_REVOCATION_CHECK` when performing HTTPS revocation checks. Mitigations:
	- Use `curl -k https://app.ledger-mind.org/_up` for a quick probe (ignores revocation).
	- Or use PowerShell: `Invoke-WebRequest -SkipCertificateCheck https://app.ledger-mind.org/_up`.
* QUIC buffer warnings are benign; to silence if noisy, set env `TUNNEL_TRANSPORT_PROTOCOL=http2` (uncomment in override file) and recreate cloudflared.
* Healthcheck now targets `http://nginx/_up` internally—failing health usually means nginx or its dependency chain is down.

### Recent Resilience Improvements
| Improvement | Rationale | Effect |
|-------------|-----------|--------|
| agui healthcheck (Bun fetch `/agui/ping`) | Ensure gateway readiness before nginx depends | Prevents nginx routing to dead agui |
| Deferred DNS in `nginx.conf` (resolver + maps) | Avoid startup crash if containers not yet in DNS | Eliminates boot-time `host not found` loops |
| `depends_on` switched to `service_healthy` (backend, agui) | Gate nginx until upstreams ready | Reduces early 502s during deploy |
| Cloudflared healthcheck switched to origin `_up` | Detect origin path unavailability | Faster edge issue detection |
| `edge-sanity` make target + PS script | Single-command smoke (internal + edge) | Faster verification / post-deploy QA |

Smoke Sequence (Edge):
```
pwsh -File scripts/edge-sanity.ps1
```
If external checks fail but internal succeed: verify cloudflared running, then check logs for auth or ingress config drift.

## 7. Log Triage Priorities
1. cloudflared: origin 502 lines or reconnect loops.
2. nginx: upstream timeouts, 5xx counts.
3. backend: stack traces, crypto init warnings, model adapter errors.
4. ollama: model load failures.

### 7.1 Model Warming (New Behavior)
Large models (e.g., `gpt-oss:20b`) can require several seconds on first access after a cold deploy. The backend now:
* Performs a lightweight one-time warmup (lists models) on first /agent/chat.
* In the first warm window (default 60s from process start) a read timeout triggers one retry (300–700ms backoff).
* If the retry also times out, the API returns `503` with JSON `{"error":"model_warming","hint":"Model is starting; please retry."}` instead of a generic 500.
* Subsequent successful calls mark the model warm and normal (fast) behavior resumes.

Timeout / retry knobs (env vars):
| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_CONNECT_TIMEOUT` | 10 | Seconds for TCP connect to LLM runtime |
| `LLM_READ_TIMEOUT` | 45 | Seconds for generation read (was 15) |
| `LLM_INITIAL_RETRY` | 1 | Enable single retry during warm window (0 disables) |
| `LLM_WARM_WINDOW_S` | 60 | Grace period where warming 503 considered normal |

Operational Guidance:
1. Post-deploy, you can pre-warm proactively:
	```powershell
	Invoke-RestMethod http://backend:8000/agent/models | Out-Null
	```
2. Treat a single `model_warming` 503 during the first minute as expected; repeated 503s beyond warm window => inspect `ollama` logs for load errors.
3. Edge smoke tests should accept a transient 503 with `error=model_warming` as PASS.

Observed Log Signals:
* Backend: no more stack traces for early ReadTimeout; instead friendly message.
* Ollama: model load lines followed by normal generation logs.

Escalation: If warming exceeds 60s, capture:
```
docker compose logs -f ollama | grep -i load
docker compose top ollama
```
Then consider increasing `LLM_READ_TIMEOUT` or verifying host resource pressure (CPU / memory).

## 8. Performance Tips
| Issue | Suggestion |
|-------|------------|
| Slow explain responses | Warm Ollama model; ensure no container restarts | 
| High CPU backend | Profile endpoints; disable debug logging |
| Large DB growth | Prune old raw ingestion artifacts; archive monthly snapshots |

## 9. Common Recovery Actions
| Scenario | Command |
|----------|---------|
| Backend hung | `docker compose restart backend` |
| Stale static assets | `docker compose restart web nginx` |
| Tunnel degraded | `docker compose up -d --force-recreate cloudflared` |
| Model unavailable | Restart Ollama container / repull model |

## 10. Data Backups (Outline)
- Postgres volume snapshot (automated schedule recommended).
- Export critical tables monthly (CSV or Parquet) to secure bucket.
- Test restore procedure quarterly.

## 11. Future Ops Automation
| Idea | Value |
|------|-------|
| Scheduled smoke test via cron + alert | Early detection of outages |
| Log aggregation (Loki/ELK) | Centralized search | 
| Metrics + dashboards (Prometheus/Grafana) | Trend visibility |

Cross-refs: [VERIFY_PROD](VERIFY_PROD.md) · [SMOKE_TESTS](SMOKE_TESTS.md) · [SECURITY](SECURITY.md) · [CRYPTO_SETUP](CRYPTO_SETUP.md)

## 12. Web Container Modes

Two distinct modes exist for the frontend:

| Mode | Compose File | Image | Command | Live Reload | Use Case |
|------|--------------|-------|---------|-------------|----------|
| Development (Vite) | `docker-compose.dev.yml` | Node build stage (pnpm present) | `pnpm install && pnpm vite --host` | Yes | Active UI development |
| Production-style (nginx) | `docker-compose.yml` | Nginx runtime (static assets) | `null` (nginx default) | No | Prod parity / smoke tests |

Misconfiguration Symptom:
```
sh: pnpm: not found
```
Indicates the nginx runtime image (no Node) is being asked to run dev tooling.

Quick Fix:
```
docker compose down
docker compose -f docker-compose.dev.yml up -d web backend postgres
```

Sanity Checks:
```
curl -I http://127.0.0.1:5173          # Vite dev server (HTTP 200)
curl -I http://127.0.0.1:8000/healthz  # Backend health
```

Production Cycle:
```
docker compose build web
docker compose -f docker-compose.yml -f docker-compose.prod.override.yml up -d
```

Make / Scripts:
* `make dev` or `scripts/dev-stack.ps1` — start dev (Vite) stack.
* `make prod` or `scripts/prod.ps1` — start production-style stack.
* `make stop` — tear down current stack.

Guideline: Avoid mounting the entire `./apps/web` source into the nginx runtime container. Instead, rebuild the image to update static assets.

