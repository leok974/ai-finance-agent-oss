# LedgerMind – Debugging & Troubleshooting

Comprehensive guide to diagnosing and fixing common issues in LedgerMind.

---

## Quick Diagnostics

### Health Check Commands

```powershell
# Full system health
curl http://localhost:8083/api/healthz | jq

# Individual services
curl http://localhost:8083/api/ready                  # Liveness
curl http://localhost:8083/api/crypto-status | jq    # Encryption
curl http://localhost:8083/ml/status | jq            # ML pipeline
curl http://localhost:8083/agent/models | jq         # LLM availability

# Container status
docker ps --filter "name=ai-finance" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"

# View logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
```

---

## Database Issues

### Password Authentication Failed

**Symptom:** Backend crashes with `FATAL: password authentication failed for user "myuser"`

**Cause:** Postgres volume initialized with different password than current `.env` file

**Fix (non-destructive, preserves data):**
```powershell
# Update password in running container
docker exec ledgermind-dev-postgres-1 psql -U myuser -d postgres -c \
  "ALTER ROLE myuser WITH PASSWORD 'changeme';"

# Export for backend
$env:POSTGRES_PASSWORD='changeme'

# Restart backend only
docker compose -f docker-compose.dev.yml -p ledgermind-dev restart backend

# Verify
curl http://127.0.0.1:8000/health/simple
```

**Fix (destructive, discards all data):**
```powershell
docker compose -f docker-compose.dev.yml -p ledgermind-dev down
docker volume rm ledgermind-dev_pgdata
$env:POSTGRES_PASSWORD='changeme'
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d
```

### Migration Failures

**Symptom:** `alembic upgrade head` fails with "column already exists"

**Diagnosis:**
```powershell
# Check current schema version
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini current

# Compare to expected
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c apps/backend/alembic.ini heads
```

**Fix:** Use reconciliation pattern (safe adds only)
```python
# In migration file
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Check if column exists before adding
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('table_name')]

    if 'new_column' not in columns:
        op.add_column('table_name', sa.Column('new_column', sa.String()))
```

---

## API Issues

### API Returns HTML (Unexpected token '<')

**Symptom:**
- Frontend cards crash trying to parse JSON
- Network tab shows `Content-Type: text/html` for API URLs
- Console error: `SyntaxError: Unexpected token '<'`

**Cause:** Request fell into SPA fallback (`location / { try_files $uri /index.html; }`)

**Fix:** Add explicit API routing before SPA fallback in `nginx.conf`:

```nginx
# 1. Auth MUST come first (never hit SPA)
location ^~ /auth {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  proxy_pass http://backend:8000;
}

# 2. API paths (regex for dynamic routes)
location ~ ^/(charts|txns|transactions|unknowns|overview|merchants|dashboard|models|rules|ml|stats|agent|report|docs|openapi\.json)(/|$) {
  proxy_set_header Host $host;
  add_header Cache-Control "no-store" always;
  proxy_pass http://backend:8000;
}

# 3. Health & upload
location = /ready   { proxy_pass http://backend:8000/ready; }
location = /healthz { proxy_pass http://backend:8000/healthz; }
location = /ingest  {
  client_max_body_size 50m;
  proxy_pass http://backend:8000/ingest;
}

# 4. SPA LAST
location / { try_files $uri /index.html; }
```

**Reload nginx:**
```powershell
docker compose -f docker-compose.prod.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

**Verify:**
```powershell
$net='ai-finance-agent-oss-clean_default'
docker run --rm --network $net curlimages/curl:8.11.1 sh -c \
  "curl -sS -i -H 'Host: app.ledger-mind.org' 'http://nginx:80/charts/month_summary?month=2025-08' | head -12"
# Expect: HTTP/1.1 200 OK + Content-Type: application/json
```

### POST /auth/refresh Returns 405

**Symptom:** OAuth login works, but page refresh logs user out

**Cause:** nginx routing `/auth/refresh` to SPA instead of backend

**Fix:** Use `location ^~ /auth` (priority prefix match) instead of `location /auth`

### API Returns 401 Unauthorized

**Symptom:** All API calls fail with 401 after login

**Diagnosis:**
```powershell
# Check cookies
# In browser DevTools → Application → Cookies → app.ledger-mind.org
# Should see: access_token_cookie, refresh_token_cookie (httpOnly)

# Check backend logs
docker compose -f docker-compose.prod.yml logs -f backend | Select-String "401"
```

**Common causes:**
1. **Cookies not set:** Check OAuth callback sets cookies correctly
2. **Domain mismatch:** Cookies set for wrong domain (must be `.ledger-mind.org`)
3. **SameSite strict:** If calling from iframe, use `SameSite=None; Secure`
4. **Token expired:** Refresh flow broken (see POST 405 fix above)

---

## Frontend Issues

### Chat CSS Missing in Production

**Symptom:** Chat renders unstyled (no glassmorphic backdrop, wrong positioning)

**Cause:** Vite code-splitting created orphaned CSS chunk

**Fix:** Ensure dual imports in `apps/web/src/`:

**`index.css`:**
```css
@import "./chat/index.css";  /* ← Must be present */
```

**`chat/ChatDock.tsx`:**
```typescript
import '../chat/index.css';  /* ← Also required */
```

**Verification:**
```powershell
pnpm -C apps/web build
pnpm -C apps/web verify:chat-css  # Checks for .lm-chat-* rules in bundle
```

### Console Errors: Failed to fetch

**Symptom:** All API calls fail with `TypeError: Failed to fetch`

**Diagnosis:**
```powershell
# Check network in DevTools
# If Status = (failed), check:
1. Backend container running
2. nginx routing correct
3. CORS headers present

# Test direct backend
curl http://localhost:8000/api/healthz
```

**Common causes:**
1. **Backend not running:** `docker compose up -d backend`
2. **Wrong API base:** Check `VITE_API_BASE` (should be `/`)
3. **CORS blocked:** Backend must set `Access-Control-Allow-Origin`

### React Hydration Errors

**Symptom:** Console shows "Hydration failed" warnings

**Cause:** Server-rendered HTML doesn't match client-rendered React

**Fix:** LedgerMind uses client-side rendering only (no SSR), so this shouldn't occur. If it does:
1. Check for mismatched `NODE_ENV` between build and runtime
2. Ensure no dynamic content in initial render (use `useEffect`)

---

## LLM / Model Issues

### No Models Available

**Symptom:** Explain/Rephrase buttons disabled, `llmStore.modelsOk === false`

**Diagnosis:**
```powershell
# Check model availability
curl http://localhost:8083/agent/models | jq

# Expected:
{
  "providers": [
    {"name": "ollama", "healthy": true, "models": ["llama3.2:latest"]}
  ],
  "all_models": ["llama3.2:latest"]
}

# If empty, check Ollama
curl http://localhost:11434/api/tags
docker compose logs -f ollama
```

**Fix:**
```powershell
# Pull missing model
docker compose exec ollama ollama pull llama3.2

# Verify
curl http://localhost:11434/api/tags
```

### LLM Requests Timeout

**Symptom:** Chat hangs, backend logs show timeout errors

**Diagnosis:**
```powershell
# Check backend timeout settings
docker compose exec backend env | grep TIMEOUT

# Check Ollama response time
time curl -X POST http://localhost:11434/api/generate -d '{"model":"llama3.2","prompt":"Hi"}'
```

**Fix:** Increase timeout in `nginx.conf`:
```nginx
location /agent {
  proxy_read_timeout 300s;  # 5 minutes
  proxy_send_timeout 300s;
  proxy_pass http://backend:8000;
}
```

---

## Cloudflare Tunnel Issues

### 502 Bad Gateway

**Symptom:** External requests fail with 502, but local curl works

**Cause:** Tunnel trying HTTPS to origin, but nginx only listens HTTP

**Fix:** Update `~/.cloudflared/config.yml`:
```yaml
ingress:
  - hostname: app.ledger-mind.org
    service: http://localhost:8083  # ← NOT https://
    originRequest:
      httpHostHeader: app.ledger-mind.org
```

**Restart tunnel:**
```powershell
# If running as service
sudo cloudflared service uninstall
sudo cloudflared service install
sudo systemctl restart cloudflared

# If running manually
cloudflared tunnel run <tunnel-name>
```

### QUIC Fallback Warnings

**Symptom:** Tunnel logs show "QUIC connection failed, falling back to HTTP/2"

**Impact:** None (HTTP/2 fallback works fine)

**Why:** Cloudflare can't establish QUIC to local origin (expected behavior)

---

## Encryption Issues

### KMS Unwrap Failed

**Symptom:** Backend crashes on startup with "Failed to unwrap DEK"

**Diagnosis:**
```powershell
# Check KMS config
docker compose exec backend env | grep -E 'GCP_KMS|GOOGLE_APPLICATION_CREDENTIALS'

# Verify service account permissions
gcloud kms keys list --location=global --keyring=ledgermind-keyring
gcloud kms keys get-iam-policy <key-name> --location=global --keyring=ledgermind-keyring
```

**Common causes:**
1. **Missing credentials:** `GOOGLE_APPLICATION_CREDENTIALS` not set or file missing
2. **Insufficient permissions:** SA needs `roles/cloudkms.cryptoKeyEncrypterDecrypter`
3. **Wrong key:** `GCP_KMS_KEY` points to non-existent key
4. **Network:** Container can't reach `cloudkms.googleapis.com`

**Fix:**
```powershell
# Verify credentials file mounted
docker compose exec backend ls -la /app/secrets/gcp-sa-key.json

# Test KMS access
docker compose exec backend python -c "
from google.cloud import kms
client = kms.KeyManagementServiceClient()
key_name = 'projects/.../locations/.../keyRings/.../cryptoKeys/...'
print(client.get_crypto_key(name=key_name))
"
```

---

## ML Pipeline Issues

### Suggestions Not Showing

**Symptom:** Transactions marked "unknown", but no ML suggestions appear

**Diagnosis:**
```powershell
# Check ML status
curl http://localhost:8083/ml/status | jq

# Expected:
{
  "shadow_mode": false,
  "canary_pct": 50,
  "confidence_threshold": 0.50
}

# Check logs
docker compose logs backend | Select-String "suggest_auto"
```

**Common causes:**
1. **Shadow mode enabled:** Set `shadow_mode: false` in config
2. **Canary at 0%:** Increase via `make canary-10` (or 50/100)
3. **Below confidence threshold:** Txn confidence < 0.50 → "Ask agent"

### Merchant Labels Not Applied

**Symptom:** Manual categorization scope=same_merchant doesn't apply to other txns

**Diagnosis:**
```powershell
# Check merchant labeler
docker compose exec backend python -c "
from app.services.categorize_suggest import get_merchant_majority_label
# Test on known merchant
"
```

**Fix:** Run backfill script:
```sql
-- apps/backend/scripts/backfill_merchant_labels.sql
UPDATE transactions t
SET category_slug = (
  SELECT mode() WITHIN GROUP (ORDER BY category_slug)
  FROM transactions
  WHERE merchant_name = t.merchant_name
    AND category_slug != 'unknown'
  GROUP BY merchant_name
  HAVING COUNT(*) >= 3
)
WHERE category_slug = 'unknown';
```

---

## Performance Issues

### Slow Page Load

**Diagnosis:**
```powershell
# Check network waterfall in DevTools
# Look for:
# 1. Blocking requests (wait time)
# 2. Large payloads (transfer size)
# 3. Sequential fetches (should be parallel)
```

**Common fixes:**
1. **Parallel fetches:** Use `Promise.all()` for independent queries
2. **Reduce payload:** Add pagination, limit fields
3. **Enable caching:** Check `Cache-Control` headers on static assets

### High Memory Usage

**Diagnosis:**
```powershell
# Container stats
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```

**Common causes:**
1. **LLM model loaded:** Ollama keeps models in memory (expected)
2. **Postgres cache:** Normal behavior, releases on pressure
3. **Memory leak:** Check backend logs for unclosed connections

---

## CSP Violations

### Console Shows CSP Errors

**Symptom:** Console: "Refused to execute inline script because it violates CSP"

**Diagnosis:**
```powershell
# Check CSP header
curl -I http://localhost:8083 | grep -i content-security-policy

# Expected (from server, not <meta> tag):
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
```

**Fix:** CSP must come from **server headers**, not inline `<meta>` tags

**Backend (`main.py`):**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    ContentSecurityPolicyMiddleware,
    policy="default-src 'self'; script-src 'self'; ..."
)
```

---

## Testing Issues

### E2E Tests Fail Locally

**Symptom:** Playwright tests pass in CI but fail locally

**Common causes:**
1. **Services not running:** Start dev stack first
2. **Port conflicts:** Check `docker ps` for port bindings
3. **Database state:** Previous test run didn't clean up

**Fix:**
```powershell
# Reset dev environment
docker compose -f docker-compose.dev.yml -p ledgermind-dev down
docker volume rm ledgermind-dev_pgdata
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d

# Run tests
pnpm -C apps/web exec playwright test
```

### Hermetic Tests Fail

**Symptom:** `apps/backend/scripts/test.ps1 -Hermetic` fails

**Diagnosis:**
```powershell
# Run with verbose output
apps/backend/scripts/test.ps1 -Hermetic -PytestArgs "-vv"
```

**Common causes:**
1. **Missing fixtures:** Check `conftest.py` for required fixtures
2. **External call not stubbed:** Hermetic tests must stub all HTTP/DB calls
3. **Test isolation:** Tests modifying shared state

---

## Log Analysis

### Backend Logs

```powershell
# Follow logs
docker compose -f docker-compose.prod.yml logs -f backend

# Search for errors
docker compose logs backend | Select-String "ERROR|CRITICAL"

# Filter by endpoint
docker compose logs backend | Select-String "/agent/chat"
```

### nginx Logs

```powershell
# Access log
docker compose exec nginx tail -f /var/log/nginx/access.log

# Error log
docker compose exec nginx tail -f /var/log/nginx/error.log
```

### Structured Logging

Backend uses structured JSON logs (future):
```json
{
  "timestamp": "2025-11-07T12:34:56Z",
  "level": "ERROR",
  "message": "LLM request timeout",
  "context": {
    "model": "llama3.2",
    "user_id": "abc123",
    "duration_ms": 30000
  }
}
```

---

**See Also:**
- [Architecture & System Design](OVERVIEW.md)
- [Infrastructure & Deployment](INFRASTRUCTURE.md)
- [Release Notes](RELEASE_NOTES.md)
