# LedgerMind – Infrastructure & Deployment

Complete guide to deployment, operations, and infrastructure for LedgerMind.

---

## Production Environment

**Hosting:** Single Docker host (Windows with Linux engine)
**Domain:** `app.ledger-mind.org`
**Edge:** Cloudflare Tunnel (no open ports, global CDN)
**Build:** Local images only (no registry)

### Architecture

```
Cloudflare Edge (TLS, DDoS, CDN)
   ↓ (Tunnel: QUIC/HTTP/2)
cloudflared (tunnel client)
   ↓ (HTTP)
nginx:80 (reverse proxy + static assets)
   ↓
backend:8000 (FastAPI)
   ↓
postgres:5432, ollama:11434, redis:6379
```

---

## Production Deployment

### Prerequisites

- Docker Desktop running (Linux engine)
- Repo cloned: `C:\ai-finance-agent-oss-clean`
- Cloudflare Tunnel configured (routes `app.ledger-mind.org` → `localhost:8083`)

### Quick Deploy Steps

**1. Get commit hash:**
```powershell
cd C:\ai-finance-agent-oss-clean
git rev-parse --short=8 HEAD  # → SHORT_SHA (e.g., 065b709a)
```

**2. Build backend:**
```powershell
cd apps/backend
docker build -t ledgermind-backend:main-$SHORT_SHA .
```

**3. Build web/nginx:**
```powershell
cd apps/web
docker build -t ledgermind-web:main-$SHORT_SHA .
```

**4. Update `docker-compose.prod.yml`:**
```yaml
services:
  backend:
    image: ledgermind-backend:main-065b709a  # ← Update
    pull_policy: never
    # ...
  nginx:
    image: ledgermind-web:main-065b709a      # ← Update
    pull_policy: never
    # ...
```

**5. Deploy:**
```powershell
docker compose -f docker-compose.prod.yml up -d backend nginx
```

**6. Verify:**
```powershell
# Check containers
docker ps --filter "name=ai-finance" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"

# Health check
curl http://localhost:8083/api/ready  # Expect HTTP 200
```

### Deployment Notes

- **No registry pulls:** `pull_policy: never` ensures local images are used
- **Cloudflare routing:** Changes deploy immediately when containers restart
- **Zero downtime:** Docker Compose handles graceful restarts
- **Rollback:** Change image tags in `docker-compose.prod.yml` and re-run step 5

---

## Configuration Management

### Environment Variables (Backend)

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | ✅ |
| `SECRET_KEY` | JWT signing | ✅ |
| `ENCRYPTION_ENABLED` | Enable KMS encryption (1/0) | Optional (default: 0) |
| `GCP_KMS_KEY` | GCP KMS key resource ID | If encryption enabled |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP SA key path | If encryption enabled |
| `OLLAMA_BASE_URL` | Ollama endpoint | Optional (default: `http://ollama:11434`) |
| `OPENAI_API_KEY` | Fallback LLM provider | Optional |
| `REDIS_URL` | Cache endpoint | Optional |

### Frontend Build Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE` | API base path | `/` |
| `VITE_BUILD_COMMIT` | Git commit hash | Injected at build |
| `VITE_BUILD_TIMESTAMP` | Build timestamp | Injected at build |

### Secrets Management

- **Encryption keys:** Stored as Docker secrets, mounted into backend container
- **OAuth credentials:** Environment variables in `docker-compose.prod.yml`
- **Database passwords:** PostgreSQL volume persists credentials, synced via `.env.prod`

---

## Database Setup & Migrations

### Initial Setup

```powershell
# Start database only
docker compose -f docker-compose.prod.yml up -d postgres

# Run migrations
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini upgrade head

# Verify
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini current
```

### Creating Migrations

```powershell
# Auto-generate from model changes
docker compose -f docker-compose.dev.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini revision --autogenerate -m "description"

# Manual migration
docker compose -f docker-compose.dev.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini revision -m "description"
```

### Migration Safety

- **CI drift guard:** `.github/workflows/db-drift.yml` blocks PRs with schema drift
- **Reconciliation pattern:** Migrations use safe `op.add_column()` only (no destructive ops)
- **Testing:** Run migrations in dev environment first
- **Rollback:** Alembic supports `downgrade` for safe reversal

---

## nginx Configuration

### Routing Rules (Precedence)

```nginx
# 1. Explicit auth paths (must not hit SPA fallback)
location ^~ /auth { proxy_pass http://backend:8000; }

# 2. API paths (regex match for dynamic routes)
location ~ ^/(charts|txns|transactions|unknowns|overview|merchants|dashboard|models|rules|ml|stats|agent|report|docs|openapi\.json)(/|$) {
  proxy_pass http://backend:8000;
  add_header Cache-Control "no-store" always;
}

# 3. Health endpoints
location = /ready   { proxy_pass http://backend:8000/ready; }
location = /healthz { proxy_pass http://backend:8000/healthz; }

# 4. File upload
location = /ingest {
  client_max_body_size 50m;
  proxy_request_buffering off;
  proxy_pass http://backend:8000/ingest;
}

# 5. Static assets (immutable, long cache)
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
  try_files $uri =404;
}

# 6. SPA fallback (LAST!)
location / { try_files $uri /index.html; }
```

### Cache Headers

- **API responses:** `Cache-Control: no-store` (always fresh)
- **Static assets:** `Cache-Control: public, immutable` + `expires 1y`
- **HTML:** `Cache-Control: no-cache` (revalidate)

### Reload Configuration

```powershell
# Test config syntax
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Reload without downtime
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Cloudflare Tunnel

### Configuration

**File:** `~/.cloudflared/config.yml`
```yaml
tunnel: <tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  - hostname: app.ledger-mind.org
    service: http://localhost:8083
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      httpHostHeader: app.ledger-mind.org
  - service: http_status:404
```

### Common Issues

**Problem:** 502 Bad Gateway on health checks
**Cause:** Tunnel tried `https://nginx:443` but nginx only listens on port 80
**Fix:** Change `originRequest.service` to `http://localhost:8083` (not HTTPS)

**Problem:** QUIC fallback warnings
**Cause:** Cloudflare can't establish QUIC to origin
**Fix:** Normal behavior, HTTP/2 fallback works fine

**Problem:** Origin mismatch errors
**Cause:** `httpHostHeader` not set
**Fix:** Add `httpHostHeader: app.ledger-mind.org` to `originRequest`

---

## Local Development

### Dev Stack

```powershell
# Start all services
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d

# View logs
docker compose -f docker-compose.dev.yml -p ledgermind-dev logs -f backend

# Stop
docker compose -f docker-compose.dev.yml -p ledgermind-dev down
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| backend | 8000 | FastAPI dev server (hot reload) |
| postgres | 5432 | Database |
| ollama | 11434 | Local LLM runtime |
| redis | 6379 | Optional cache |
| nginx | 80 | Local reverse proxy (optional) |

### Hot Reload

- **Backend:** `uvicorn --reload` watches `apps/backend/app/`
- **Frontend:** `vite dev` watches `apps/web/src/`

### Database Access

```powershell
# psql shell
docker compose -f docker-compose.dev.yml -p ledgermind-dev exec postgres \
  psql -U myuser -d ledgermind_dev

# Reset database
docker compose -f docker-compose.dev.yml -p ledgermind-dev down
docker volume rm ledgermind-dev_pgdata
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d
```

---

## Monitoring & Observability

### Health Checks

```powershell
# Liveness probe (fast)
curl http://localhost:8083/api/ready

# Full health check (DB + Redis + models)
curl http://localhost:8083/api/healthz | jq

# Encryption status
curl http://localhost:8083/api/crypto-status | jq

# ML pipeline status
curl http://localhost:8083/ml/status | jq

# Model availability
curl http://localhost:8083/agent/models | jq
```

### Metrics (Future)

Prometheus-compatible endpoints planned:
- `lm_ml_suggestion_accepts_total{model_version, source, label}` — Accept rate
- `lm_model_health_gauge{provider, model}` — Model availability
- `lm_cache_hits_total{cache_name}` — Cache performance

---

## Troubleshooting

See [DEBUGGING_GUIDE.md](DEBUGGING_GUIDE.md) for comprehensive troubleshooting.

**Quick Fixes:**

**Backend won't start (password auth failed):**
```powershell
docker exec ledgermind-dev-postgres-1 psql -U myuser -d postgres -c \
  "ALTER ROLE myuser WITH PASSWORD 'changeme';"
$env:POSTGRES_PASSWORD='changeme'
docker compose -f docker-compose.dev.yml -p ledgermind-dev restart backend
```

**API returns HTML instead of JSON:**
- Check nginx routing order (auth/API paths must come before SPA fallback)
- Verify `proxy_pass` endpoints in `nginx.conf`

**Chat CSS missing in prod:**
- Verify `index.css` imports `chat/index.css`
- Run `pnpm build && pnpm verify:chat-css`

---

## Security

### TLS/HTTPS

- **Cloudflare Edge:** Automatic TLS termination (Let's Encrypt)
- **Origin:** HTTP only (Cloudflare Tunnel encrypts tunnel traffic)

### Authentication

- **OAuth:** Google OAuth 2.0 via `/auth/login`
- **Session:** httpOnly cookies, 7-day expiry
- **CSRF:** State parameter validation on OAuth callback

### Secrets

- **KMS encryption:** GCP Cloud KMS envelope encryption for PII
- **Service account:** Mounted via Docker secrets
- **Environment variables:** Never commit `.env.prod` to git

---

**See Also:**
- [Architecture & System Design](OVERVIEW.md)
- [Debugging & Troubleshooting](DEBUGGING_GUIDE.md)
- [Release Notes](RELEASE_NOTES.md)
