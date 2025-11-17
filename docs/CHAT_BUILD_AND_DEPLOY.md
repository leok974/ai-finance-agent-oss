# Chat Build and Deploy Architecture

## Overview

LedgerMind ChatDock v2 is built as a **single-page application** served by Nginx inside a Docker container. The build pipeline injects Git metadata (branch, commit, build time) into the client bundle, and production deployment uses Cloudflare Tunnel to expose the app via `app.ledger-mind.org`.

**Deployment Stack:**
- **Frontend Build:** Vite TypeScript bundler (Rollup under the hood)
- **Web Server:** Nginx 1.27 Alpine (serves static assets + proxies API to backend)
- **Tunnel:** Cloudflared QUIC tunnel (connects Nginx to Cloudflare edge)
- **DNS:** `app.ledger-mind.org` → Cloudflare Tunnel → Nginx:80 → Static files
- **API Proxy:** Nginx forwards `/agent/*`, `/auth/*`, `/rules/*` to FastAPI backend

**Build Artifacts:**
- `index.html` (SPA shell with inline prelude script)
- `assets/*.js` (Vite code-split chunks: `index`, `vendor-react`, `vendor-charts`, `MessageRenderer`, etc.)
- `assets/*.css` (Tailwind + chat panel overrides)
- `build.json` + `version.json` (build metadata for cache-bust and debugging)

---

## Frontend Build Pipeline

### 1. Multi-Stage Dockerfile (`deploy/Dockerfile.nginx`)

**Stage 1: `webbuild` (Node.js 20 Alpine)**

Builds frontend assets with Git metadata injected as environment variables:

```dockerfile
FROM node:20-alpine AS webbuild
ARG VITE_BUILD_BRANCH=local
ARG VITE_BUILD_COMMIT=dev
ARG VITE_BUILD_TIME=unknown
ARG WEB_BRANCH=unknown
ARG WEB_COMMIT=unknown
ARG WEB_BUILD_ID=not_set

WORKDIR /w/apps/web
RUN corepack enable && pnpm install --frozen-lockfile

COPY apps/web/src ./src
COPY apps/web/index.html ./
COPY apps/web/vite.config.ts ./
# ... (copy other config files)

ENV VITE_BUILD_BRANCH=${VITE_BUILD_BRANCH} \
    VITE_BUILD_COMMIT=${VITE_BUILD_COMMIT} \
    VITE_BUILD_TIME=${VITE_BUILD_TIME} \
    WEB_BRANCH=${WEB_BRANCH} \
    WEB_COMMIT=${WEB_COMMIT} \
    WEB_BUILD_ID=${WEB_BUILD_ID}

RUN if [ -f src/build-stamp.json ]; then \
      echo "[webbuild] using existing src/build-stamp.json"; \
    else \
      node scripts/build-stamp.mjs; \
    fi \
 && pnpm build \
 && cp src/build-stamp.json dist/build.json \
 && node -e "const fs=require('fs'); \
    const s=JSON.parse(fs.readFileSync('src/build-stamp.json','utf8')); \
    const v={commit:s.commit,built_at:s.ts,build_id:s.buildId,branch:s.branch}; \
    fs.writeFileSync('dist/version.json',JSON.stringify(v,null,2));"
```

**Outputs:**
- `dist/` (frontend bundle)
- `dist/build.json` (full build stamp with metadata)
- `dist/version.json` (simplified version metadata for Nginx health checks)

---

**Stage 2: `nginx` (Nginx 1.27 Alpine)**

Copies build artifacts and configures Nginx to serve static files + proxy API:

```dockerfile
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl  # for CSP hash rendering at startup

COPY --from=webbuild /w/apps/web/dist /usr/share/nginx/html
COPY ./deploy/nginx.conf /etc/nginx/nginx.conf
COPY ./nginx/conf.d/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY ./nginx/entrypoint.d/*.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh
```

**Entrypoint Scripts:**
- `10-csp-render.sh`: Hashes inline `<script>` blocks in `index.html` and injects `sha256-<hash>` into CSP header
- `99-run.sh`: Asset integrity check (verifies `index.html` and `assets/` exist before Nginx starts)

---

### 2. Build Metadata Injection (`vite.config.ts`)

**Git Metadata Sources (priority order):**
1. **CI environment:** `VITE_BUILD_COMMIT` / `VITE_BUILD_BRANCH` / `VITE_BUILD_TIME`
2. **GitHub Actions:** `GITHUB_SHA` / `GITHUB_REF_NAME`
3. **Local Git commands:** `git rev-parse --short=12 HEAD` / `git rev-parse --abbrev-ref HEAD`
4. **Fallback:** `"unknown"` / `"local"` / `new Date().toISOString()`

**Vite Define Plugin:**
```typescript
define: {
  __WEB_BRANCH__: JSON.stringify(process.env.VITE_BUILD_BRANCH || gitBranch()),
  __WEB_COMMIT__: JSON.stringify(process.env.VITE_BUILD_COMMIT || gitCommit()),
  __WEB_BUILD_ID__: JSON.stringify(process.env.BUILD_ID || `local-${Date.now()}`),
}
```

**Client-Side Usage (`apps/web/src/main.tsx`):**
```typescript
const BRANCH = import.meta.env.VITE_GIT_BRANCH ?? "unknown";
const COMMIT = import.meta.env.VITE_GIT_COMMIT ?? "unknown";
const BUILD_AT = import.meta.env.VITE_BUILD_AT ?? new Date().toISOString();
const BUILD_TAG = `${BRANCH}@${COMMIT}`;

console.log(
  `%c🚀 LedgerMind Web`,
  "font-weight:bold;font-size:13px;color:#4ade80",
  MODE,
  BUILD_TAG,
  `(${BUILD_AT})`
);

(window as any).__LEDGERMIND_BUILD__ = {
  branch: __WEB_BRANCH__,
  commit: __WEB_COMMIT__,
  buildId: __WEB_BUILD_ID__,
  stamp: buildStamp,
};
```

**Console Output Example:**
```
🚀 LedgerMind Web prod main@7204f00a1b2c (2025-11-17T03:25:21Z)
```

---

### 3. Build Stamp JSON (`scripts/build-stamp.mjs`)

**Purpose:** Creates `src/build-stamp.json` with Git metadata and timestamp.

**Script Logic:**
```javascript
// scripts/build-stamp.mjs
const branch = process.env.VITE_BUILD_BRANCH || execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
const commit = process.env.VITE_BUILD_COMMIT || execSync('git rev-parse --short=12 HEAD').toString().trim();
const buildId = process.env.BUILD_ID || `local-${Date.now()}`;
const ts = process.env.VITE_BUILD_TIME || new Date().toISOString();

const stamp = {
  branch,
  commit,
  buildId,
  ts,
  isDev: !process.env.CI,
};

fs.writeFileSync('src/build-stamp.json', JSON.stringify(stamp, null, 2));
console.log('[build-stamp] Created:', stamp);
```

**Output (`src/build-stamp.json`):**
```json
{
  "branch": "main",
  "commit": "7204f00a1b2c",
  "buildId": "prod-2025-11-17-03-25-21",
  "ts": "2025-11-17T03:25:21Z",
  "isDev": false
}
```

**Why Two Versions?**
- `build.json` (full stamp): Used by client app for `window.__LEDGERMIND_BUILD__`
- `version.json` (simplified): Used by Nginx health checks and monitoring

---

## Docker Images & Services

### Production Services (`docker-compose.prod.yml`)

```yaml
services:
  nginx:
    image: ghcr.io/ledgermind/nginx:latest
    container_name: ledgermind-nginx
    build:
      context: .
      dockerfile: deploy/Dockerfile.nginx
      args:
        VITE_BUILD_BRANCH: ${GIT_BRANCH:-main}
        VITE_BUILD_COMMIT: ${GIT_COMMIT:-unknown}
        VITE_BUILD_TIME: ${BUILD_TIME:-unknown}
        WEB_BRANCH: ${GIT_BRANCH:-main}
        WEB_COMMIT: ${GIT_COMMIT:-unknown}
        WEB_BUILD_ID: ${BUILD_ID:-local}
        VITE_ENABLE_GOOGLE_OAUTH: 1
        VITE_API_BASE: /  # NO /api prefix for chat endpoints
    ports:
      - "80:80"
    networks:
      - infra_net  # shared with cloudflared
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: ledgermind-cloudflared
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    networks:
      - infra_net
    restart: unless-stopped
    depends_on:
      - nginx

  backend:
    image: ghcr.io/ledgermind/backend:latest
    container_name: ledgermind-backend
    environment:
      DATABASE_URL: postgresql+psycopg://...
      ENCRYPTION_ENABLED: "1"
      OPENAI_BASE_URL: http://ollama:11434/v1
    networks:
      - infra_net
      - shared-ollama
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - infra_net
    restart: unless-stopped

networks:
  infra_net:
    external: true  # shared with cloudflared
  shared-ollama:
    external: true  # shared with Ollama LLM service
```

**Service Name Contract (AI Guardrail):**
> ⚠️ **CRITICAL:** Service name `nginx` MUST NOT be changed (referenced in `cloudflared/config.yml` as `http://nginx:80`). Renaming will break Cloudflare Tunnel routing.

---

## Nginx & Asset Serving

### Nginx Configuration (`deploy/nginx.conf`)

**Location Blocks:**

```nginx
server {
  listen 80;
  server_name app.ledger-mind.org;
  root /usr/share/nginx/html;
  index index.html;

  # Health checks
  location /health {
    access_log off;
    return 200 "ok\n";
    add_header Content-Type text/plain;
  }

  location /ready {
    access_log off;
    add_header Content-Type application/json;
    return 200 '{"status":"ready"}';
  }

  # Version endpoint (returns build.json)
  location /version {
    alias /usr/share/nginx/html/build.json;
    add_header Content-Type application/json;
  }

  # API proxy (no /api prefix for chat endpoints)
  location /agent/ {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";  # SSE support
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /auth/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
  }

  location /rules/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
  }

  # Static assets with caching
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # SPA fallback (all non-API routes → index.html)
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Security Headers (`nginx/conf.d/security-headers.conf`):**
```nginx
add_header Content-Security-Policy "default-src 'self'; \
  script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; \
  style-src 'self' 'unsafe-inline'; \
  img-src 'self' data: blob: https://lh3.googleusercontent.com; \
  font-src 'self' data:; \
  connect-src 'self' https://app.ledger-mind.org wss://app.ledger-mind.org https://cloudflareinsights.com; \
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
```

**CSP Hash Rendering (`nginx/entrypoint.d/10-csp-render.sh`):**
```bash
#!/usr/bin/env sh
# Extract inline <script> blocks from index.html, hash each block, inject into CSP

HTML="/usr/share/nginx/html/index.html"
CONF_OUT="/tmp/nginx.conf"
cp /etc/nginx/nginx.conf "$CONF_OUT"

HASHES=""
if [ -f "$HTML" ]; then
  while IFS= read -r block; do
    h=$(printf "%s" "$block" | openssl dgst -sha256 -binary | openssl base64 -A)
    HASHES="$HASHES 'sha256-$h'"
  done <<EOF
$(awk 'BEGIN{RS="</script>";FS="<script"} NR>1 {print $2}' "$HTML" | sed -n 's/^[^>]*>//p')
EOF
fi

if [ -n "$HASHES" ]; then
  sed -i "s|script-src 'self'|script-src 'self' $HASHES|" "$CONF_OUT"
  echo "[csp] Injected hashes: $HASHES" >&2
fi

echo "[csp] Rendered to $CONF_OUT" >&2
```

**Why Runtime CSP Hashing?**
- Vite injects inline prelude script (`chat-prelude.ts`) for iframe compatibility
- Hash changes per build (dynamic imports, module IDs)
- Runtime hashing ensures CSP header matches actual script content (no manual sync)

---

## Cloudflare Tunnel & Domain Routing

### Tunnel Configuration (`cloudflared/config.yml`)

**Tunnel Credentials:**
- **Tunnel UUID:** `08d5feee-f504-47a2-a1f2-b86564900991`
- **Credentials File:** `/etc/cloudflared/08d5feee-f504-47a2-a1f2-b86564900991.json` (copied from `~/.cloudflared/`)

**Ingress Rules:**
```yaml
tunnel: 08d5feee-f504-47a2-a1f2-b86564900991
credentials-file: /etc/cloudflared/08d5feee-f504-47a2-a1f2-b86564900991.json

originRequest:
  connectTimeout: 10s
  tcpKeepAlive: 30s
  originServerName: ledger-mind.org
  http2Origin: true
  # httpHostHeader: REMOVED - preserve original Host header (app.ledger-mind.org)

ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80  # MUST be "nginx" (docker-compose service name)
  - hostname: ledger-mind.org
    service: http://nginx:80  # redirect handled by Nginx
  - hostname: www.ledger-mind.org
    service: http://nginx:80  # redirect handled by Nginx
  - service: http_status:404  # catch-all
```

**AI Guardrail (from config comments):**
> **CRITICAL:** `service: http://nginx:80` MUST use docker-compose service name `nginx`, NOT container name (e.g., `ai-finance-agent-oss-clean-nginx-1`). Docker Compose provides DNS resolution for service names. Changing this will break tunnel routing.

**Verification Commands:**
```bash
# Check root does NOT redirect in a loop
curl -v https://app.ledger-mind.org/ --max-redirs 5

# Check E2E session endpoint works through Cloudflare
curl -v -X POST https://app.ledger-mind.org/api/e2e/session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Common Issue: Infinite 308 Redirect Loop**
- **Cause:** `httpHostHeader: ledger-mind.org` forces Host header rewrite, triggering Nginx canonical redirect
- **Fix:** Remove `httpHostHeader` from `cloudflared/config.yml` (let Cloudflared preserve original Host header)

---

## Build Banner & Versioning

### 1. Console Build Banner

**Output Format:**
```
🚀 LedgerMind Web prod main@7204f00a1b2c (2025-11-17T03:25:21Z)
```

**Implementation (`apps/web/src/main.tsx`):**
```typescript
const MODE = import.meta.env.PROD ? "prod" : "dev";
const BRANCH = import.meta.env.VITE_GIT_BRANCH ?? "unknown";
const COMMIT = import.meta.env.VITE_GIT_COMMIT ?? "unknown";
const BUILD_AT = import.meta.env.VITE_BUILD_AT ?? new Date().toISOString();
const BUILD_TAG = `${BRANCH}@${COMMIT}`;
const ICON = MODE === "prod" ? "🚀" : "🧪";

console.log(
  `%c${ICON} LedgerMind Web`,
  "font-weight:bold;font-size:13px;color:#4ade80",
  MODE,
  BUILD_TAG,
  `(${BUILD_AT})`
);
```

**Styled Console Output:**
- Green bold text with emoji icon
- Shows mode (prod/dev), Git branch@commit, build timestamp
- Available immediately on page load (before React mounts)

---

### 2. Build Metadata API

**Endpoint:** `GET https://app.ledger-mind.org/version`

**Response (`version.json`):**
```json
{
  "commit": "7204f00a1b2c",
  "built_at": "2025-11-17T03:25:21Z",
  "build_id": "prod-2025-11-17-03-25-21",
  "branch": "main"
}
```

**Usage:** Monitoring scripts, cache-bust validation, rollback verification.

---

### 3. Window Global Metadata

**Attached Object (`window.__LEDGERMIND_BUILD__`):**
```javascript
window.__LEDGERMIND_BUILD__ = {
  branch: "main",
  commit: "7204f00a1b2c",
  buildId: "prod-2025-11-17-03-25-21",
  stamp: {
    branch: "main",
    commit: "7204f00a1b2c",
    buildId: "prod-2025-11-17-03-25-21",
    ts: "2025-11-17T03:25:21Z",
    isDev: false,
  },
};
```

**Usage:** Debugging via browser DevTools console.

---

### 4. Meta Tag Version

**HTML `<head>` Injection:**
```html
<meta name="x-ledgermind-build" content="main@7204f00a1b2c#prod-2025-11-17-03-25-21">
```

**Usage:** HTTP response header inspection, SEO/monitoring tools.

---

## Common Drift Issues

### 1. **Old Bundle Served After Deploy**

**Symptom:** ChatDock v2 CSS changes not visible in production, console shows old commit hash.

**Causes:**
- Browser cache (Service Worker or HTTP cache)
- CDN cache (Cloudflare edge cache)
- Nginx stale assets (old Docker image)

**Debugging:**
```bash
# Check Nginx container build metadata
docker exec ledgermind-nginx cat /usr/share/nginx/html/version.json

# Check actual file timestamp
docker exec ledgermind-nginx ls -lh /usr/share/nginx/html/assets/index-*.js

# Force hard reload in browser (Ctrl+Shift+R / Cmd+Shift+R)
# Or clear Service Worker
await navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
```

**Fix:**
```bash
# Rebuild and restart Nginx container
docker compose -f ops/docker-compose.prod.yml build nginx
docker compose -f ops/docker-compose.prod.yml up -d nginx

# Verify new container is running
docker ps | grep nginx

# Purge Cloudflare cache (via dashboard or API)
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {api_token}" \
  -d '{"purge_everything":true}'
```

---

### 2. **Wrong Container Serves Chat CSS**

**Symptom:** Chat panel layout broken, `/assets/index-*.css` returns 404 or stale content.

**Cause:** Multiple Nginx containers running (dev + prod), or wrong container exposed on port 80.

**Debugging:**
```bash
# List all Nginx containers
docker ps -a | grep nginx

# Check which container is bound to port 80
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep :80

# Verify correct container serves assets
curl -I http://127.0.0.1/assets/index.css
```

**Fix:**
```bash
# Stop all Nginx containers
docker ps -a | grep nginx | awk '{print $1}' | xargs docker stop

# Start only production container
docker compose -f ops/docker-compose.prod.yml up -d nginx
```

---

### 3. **Build Args Not Injected**

**Symptom:** Console shows `unknown@unknown (unknown)` instead of real Git metadata.

**Cause:** Build args not passed to `docker build` or environment variables missing.

**Debugging:**
```bash
# Check build args in docker-compose.yml
cat docker-compose.prod.yml | grep -A 10 "build:"

# Check environment variables during build
docker compose -f ops/docker-compose.prod.yml config | grep VITE_BUILD
```

**Fix:**
```bash
# Set build args explicitly
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
export GIT_COMMIT=$(git rev-parse --short=12 HEAD)
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Rebuild with args
docker compose -f ops/docker-compose.prod.yml build \
  --build-arg VITE_BUILD_BRANCH=$GIT_BRANCH \
  --build-arg VITE_BUILD_COMMIT=$GIT_COMMIT \
  --build-arg VITE_BUILD_TIME=$BUILD_TIME \
  nginx
```

---

### 4. **Infinite Redirect Loop (Cloudflare Tunnel)**

**Symptom:** Browser shows "This page isn't working. app.ledger-mind.org redirected you too many times."

**Cause:** Cloudflared forces `Host: ledger-mind.org` via `httpHostHeader`, triggering Nginx canonical redirect.

**Debugging:**
```bash
# Check redirect chain
curl -v https://app.ledger-mind.org/ --max-redirs 5 2>&1 | grep -E "< HTTP|< Location"

# Expected: NO redirects (200 OK)
# Broken: Multiple 308 redirects (app → www → app → www...)
```

**Fix:**
```yaml
# cloudflared/config.yml - REMOVE httpHostHeader
originRequest:
  connectTimeout: 10s
  # httpHostHeader: ledger-mind.org  # ❌ REMOVE THIS LINE
```

**Restart tunnel:**
```bash
docker compose -f ops/docker-compose.prod.yml restart cloudflared

# Verify fix
curl -I https://app.ledger-mind.org/
# Should return: HTTP/2 200
```

---

### 5. **CSP Blocks Inline Scripts**

**Symptom:** Browser console shows CSP violation: `Refused to execute inline script because it violates the following Content Security Policy directive`.

**Cause:** CSP hashes not injected, or hashes don't match actual script content.

**Debugging:**
```bash
# Check Nginx entrypoint logs
docker logs ledgermind-nginx 2>&1 | grep csp

# Expected: "[csp] Injected hashes: 'sha256-abc123...'"
# Broken: "[csp] no inline scripts; placeholder removed"

# Check actual CSP header
curl -I https://app.ledger-mind.org/ | grep -i content-security-policy
```

**Fix:**
```bash
# Verify 10-csp-render.sh is running
docker exec ledgermind-nginx ls -lh /docker-entrypoint.d/10-csp-render.sh

# Check if script is executable
docker exec ledgermind-nginx sh -c "test -x /docker-entrypoint.d/10-csp-render.sh && echo 'executable' || echo 'NOT executable'"

# Rebuild Nginx container to re-run CSP script
docker compose -f ops/docker-compose.prod.yml build nginx
docker compose -f ops/docker-compose.prod.yml up -d nginx
```

---

### 6. **Assets Cache Miss on Deploy**

**Symptom:** First user after deploy sees slow page load (cold cache), subsequent loads are fast.

**Cause:** Nginx asset cache not warmed, or immutable cache headers prevent re-validation.

**Fix (Pre-warm cache):**
```bash
# Warm asset cache after deploy
docker exec ledgermind-nginx sh -c "for f in /usr/share/nginx/html/assets/*; do cat \$f > /dev/null; done"

# Or use curl from outside
curl -s https://app.ledger-mind.org/assets/index.js > /dev/null
curl -s https://app.ledger-mind.org/assets/index.css > /dev/null
```

**Fix (Nginx config with smarter caching):**
```nginx
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
  # Add ETag for validation
  etag on;
}
```

---

## References

- **Dockerfile:** `deploy/Dockerfile.nginx`
- **Nginx config:** `deploy/nginx.conf`
- **Nginx security headers:** `nginx/conf.d/security-headers.conf`
- **CSP rendering script:** `nginx/entrypoint.d/10-csp-render.sh`
- **Vite config:** `apps/web/vite.config.ts`
- **Build banner:** `apps/web/src/main.tsx`
- **Build stamp script:** `apps/web/scripts/build-stamp.mjs`
- **Cloudflare tunnel config:** `cloudflared/config.yml`
- **Docker Compose prod:** `docker-compose.prod.yml`
