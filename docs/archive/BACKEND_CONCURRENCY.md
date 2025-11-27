# Backend Concurrency & Database Configuration

## Current Production Settings

### Uvicorn Workers
- **UVICORN_WORKERS**: `2` (default)
- **WEB_CONCURRENCY**: `2` (gunicorn compatibility)
- **Command flags**: `--limit-concurrency 200 --timeout-keep-alive 20`

**Rationale**:
- 2 workers balance throughput with memory/CPU on current infrastructure
- limit-concurrency prevents request queue saturation
- Handles ~8-10 concurrent E2E test requests comfortably

### Database Connection Pool
- **DB_POOL_SIZE**: `10` (connections per worker)
- **DB_MAX_OVERFLOW**: `20` (additional connections during spikes)
- **DB_POOL_PRE_PING**: `1` (validates connections before use)

**Rationale**:
- Pool size × workers = 20 total max connections (10 × 2)
- With overflow: up to 60 connections possible (30 per worker)
- Prevents "QueuePool limit" errors under load
- Pre-ping eliminates stale connection failures

### Nginx Proxy Configuration
- **Upstream keepalive**: `64` connections
- **Proxy timeouts**:
  - `proxy_connect_timeout`: `5s`
  - `proxy_read_timeout`: `75s` (for `/agent/*` endpoints)
  - `proxy_send_timeout`: `75s`

**Rationale**:
- Keepalive reduces TCP handshake overhead
- 75s timeout accommodates LLM response times
- Short connect timeout fails fast on backend issues

### Cloudflare Tunnel
- **Protocol**: `quic` (faster, more reliable)
- **Retries**: `3`
- **HTTP/2 Origin**: `enabled`

## E2E Testing Configuration

### Playwright Workers
- **Production**: `2 workers` (via `--workers=2`)
- **Development**: `1 worker` (serialized for SQLite)

**Why 2 workers?**
- With 10 workers: massive backend saturation, 36/48 tests failing
- With 2 workers: 7/9 passing, clean resource utilization
- Prevents DB pool exhaustion and request queue buildup

### Test Categories
- **@prod-critical**: Fast, deterministic tests (stub/echo modes)
- **@requires-llm**: LLM-dependent tests (excluded by default)

Run critical tests only:
```bash
pnpm run test:e2e:prod -- -g "@prod-critical"
```

Run LLM tests explicitly:
```bash
PW_WORKERS=1 pnpm run test:e2e:prod -- -g "@requires-llm"
```

## Smoke Testing

Fast deterministic smoke test (no auth required):
```bash
# PowerShell
.\scripts\smoke-prod-fast.ps1

# Bash
./scripts/smoke-prod.sh
```

Tests:
- ✅ Stub mode latency (<200ms)
- ✅ Echo mode functionality
- ✅ API path compatibility (`/api/agent/*` → `/agent/*`)

## Monitoring & Alerts

### Key Metrics
- **DB pool usage**: Monitor `pool_size` gauge
- **Request latency**: p50/p95 for `/agent/chat`
- **Empty replies**: Counter for `agent_chat_empty_reply_total`

### Warning Signs
- ❌ DB "QueuePool limit" errors → increase pool size or reduce workers
- ❌ 502/503 errors → check uvicorn worker count vs CPU
- ❌ Slow p95 latency (>2s) → check DB pool, add caching

## Scaling Guidelines

### When to increase workers
- ✅ CPU utilization consistently <50%
- ✅ DB pool has headroom (usage <60%)
- ✅ No queue buildup in uvicorn

### When NOT to increase workers
- ❌ DB pool at capacity
- ❌ CPU pegged at 100%
- ❌ Memory pressure (swap usage)
- ❌ Request queue growing

**Rule of thumb**: `workers × pool_size` should not exceed PostgreSQL `max_connections` (typically 100).

## References
- [Uvicorn Deployment Guide](https://www.uvicorn.org/deployment/)
- [SQLAlchemy Connection Pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- Playwright E2E best practices: `apps/web/playwright.config.ts`
