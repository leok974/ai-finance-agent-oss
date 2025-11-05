# Nginx Proxy Fix Reference

## Problem Summary
Backend API routes (`/api/agent/tools/*`) returned 404 even though routes existed.

## Root Causes

### 1. Missing Router Registrations (FastAPI)
Only `agent_tools_rag` was imported/registered. Other routers like `agent_tools_meta`, `agent_tools_charts`, etc. were not included in `apps/backend/app/main.py`.

**Fix:** Added all missing imports and `app.include_router()` calls.

### 2. Nginx Variable in proxy_pass
Using `proxy_pass http://$backend_upstream/;` prevented proper URI rewriting. Nginx handles variables differently - it doesn't do the same prefix-stripping as with literal addresses.

**Fix:** Changed to literal address: `proxy_pass http://backend:8000/;`

## Critical Configuration

```nginx
location /api/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # IMPORTANT: literal address + trailing slash strips /api/ prefix
    proxy_pass http://backend:8000/;
}
```

## Hardening Steps Implemented

### 1. Bind-Mount for Live Config Edits
**File:** `docker-compose.prod.yml`

```yaml
services:
  nginx:
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf:ro
```

**Workflow:**
```bash
# Edit nginx.conf, then:
docker exec -it ai-finance-agent-oss-clean-nginx-1 nginx -t
docker exec -it ai-finance-agent-oss-clean-nginx-1 nginx -s reload
```

### 2. Extended Logging Format
**File:** `deploy/nginx.conf`

Added `main_ext` format with upstream details:
```nginx
log_format main_ext '$remote_addr - $remote_user [$time_local] '
                   '"$request" $status $body_bytes_sent '
                   '"$http_referer" "$http_user_agent" '
                   'uri="$uri" req="$request_uri" '
                   'upstream="$upstream_addr" us="$upstream_status" rt="$request_time" uct="$upstream_connect_time" '
                   'uht="$upstream_header_time" urt="$upstream_response_time"';
```

To use: Change `access_log` line to `main_ext` instead of `main_json`.

## Regression Tests

```bash
# 1) Direct backend
curl -sS http://localhost:8000/agent/tools/meta/latest_month

# 2) Through Nginx with /api prefix
curl -sS -i http://localhost/api/agent/tools/meta/latest_month

# 3) Health endpoints
curl -sS http://localhost/api/healthz
curl -sS http://localhost/api/ready

# 4) POST route
curl -sS -X POST http://localhost/api/agent/tools/rag/status \
  -H 'content-type: application/json' -d '{}'
```

## FastAPI Router Checklist

Ensure all routers are imported and registered in `apps/backend/app/main.py`:

```python
from app.routers import (
    agent_tools_meta,
    agent_tools_charts,
    agent_tools_categorize,
    agent_tools_transactions,
    agent_tools_rules,
    agent_tools_rules_crud,
    agent_tools_rules_save,
    agent_tools_rules_apply_all,
    agent_tools_budget,
    agent_tools_insights,
    agent_tools_suggestions,
    agent_tools_rag,
    agent_actions,
)

# In router registration section:
app.include_router(agent_tools_meta.router)
app.include_router(agent_tools_charts.router)
app.include_router(agent_tools_categorize.router)
app.include_router(agent_tools_transactions.router)
app.include_router(agent_tools_rules.router)
app.include_router(agent_tools_rules_crud.router)
app.include_router(agent_tools_rules_save.router)
app.include_router(agent_tools_rules_apply_all.router)
app.include_router(agent_tools_budget.router)
app.include_router(agent_tools_insights.router)
app.include_router(agent_tools_suggestions.router)
app.include_router(agent_tools_rag.router)
app.include_router(agent_actions.router)
```

## Key Takeaway

**Never use variables in `proxy_pass` with URI rewriting.** Nginx's URI manipulation only works reliably with literal upstream addresses.

❌ `proxy_pass http://$backend_upstream/;`
✅ `proxy_pass http://backend:8000/;`
