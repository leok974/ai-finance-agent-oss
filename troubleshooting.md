# TROUBLESHOOTING

A grab-bag of fixes we used to get app.ledger-mind.org stable behind Cloudflare + Nginx + Docker on Windows.

## API returns HTML → Unexpected token '<' in UI

**Symptom**

- Cards (Overview/Uncategorized/etc.) crash trying to parse JSON.
- DevTools → Network shows Content-Type: text/html for an API URL.

**Cause**

- The request fell into the SPA fallback: location / { try_files $uri /index.html; }.

**Fix (add before SPA block)**

```nginx
# Explicit auth first (refresh/login must never hit SPA)
location ^~ /auth {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Authorization $http_authorization;
  proxy_pass http://backend:8000;
}

# "Big net" for API-ish paths (extend as needed)
location ~ ^/(charts|txns|transactions|unknowns|overview|summary|expanded|merchants|spending_trends|dashboard|models|rules|ml|stats|agent|report|docs|openapi\.json)(/|$) {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Authorization $http_authorization;
  add_header Cache-Control "no-store" always;
  proxy_read_timeout 300s; proxy_send_timeout 300s;
  proxy_pass http://backend:8000;
}

# Health + upload
location = /ready   { proxy_pass http://backend:8000/ready;   proxy_set_header Host $host; }
location = /healthz { proxy_pass http://backend:8000/healthz; proxy_set_header Host $host; }
location = /ingest  {
  client_max_body_size 50m; proxy_request_buffering off;
  proxy_set_header Host $host; proxy_read_timeout 300s; proxy_send_timeout 300s;
  proxy_pass http://backend:8000/ingest;
}

# SPA LAST
location / { try_files $uri /index.html; }
```

**Reload**

```powershell
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec nginx nginx -s reload
```

**Verify**

```powershell
$net='ai-finance-agent-oss-clean_default'
docker run --rm --network $net curlimages/curl:8.11.1 sh -lc \
  "curl -sS -i -H 'Host: app.ledger-mind.org' 'http://nginx:80/charts/month_summary?month=2025-08' | sed -n '1,12p'"
# Expect: HTTP/1.1 200 OK + Content-Type: application/json
```

## Login works only after refresh / POST /auth/refresh 405 / API 401

**Causes**

- /auth/* not proxied → SPA returns 405.
- Cookies set with flags that prevent them being sent right away.

**Fixes**

- Ensure /auth goes to backend (see block above).
- Keep session cookies usable on same-site XHR:

```nginx
# Inside server {}
proxy_cookie_flags access_token  Secure HttpOnly SameSite=Lax;
proxy_cookie_flags refresh_token Secure HttpOnly SameSite=Lax;
proxy_cookie_flags csrf_token    Secure SameSite=Lax;   # drop HttpOnly only if frontend reads it
proxy_cookie_path  / /;
# proxy_cookie_domain app.ledger-mind.org .ledger-mind.org;  # only if you truly need cross-subdomain
```

- Frontend fetch should include cookies:

```ts
fetch(url, { method, headers, body, credentials: 'include' })
```

**One-shot checks**

```powershell
# 401 w/o cookie is expected:
Invoke-WebRequest 'https://app.ledger-mind.org/charts/month_summary?month=2025-08' -UseBasicParsing

# With a valid Cookie header (copy from DevTools after login) should be 200 JSON:
$cookie='access_token=PASTE; refresh_token=PASTE'
curl.exe -sS -i -H "Cookie: $cookie" "https://app.ledger-mind.org/charts/month_summary?month=2025-08" | Select-String "HTTP/|Content-Type"
```

**Clear cookies (Chrome)**

- Address-bar lock → Cookies and site data → remove app.ledger-mind.org (and .ledger-mind.org if present), then reload.
- Or chrome://settings/siteData?search=ledger-mind.org.

## /ready shows 405 from helper curl

**Cause**

- You sent HEAD (-I). Endpoint only supports GET.

**Fix**

```powershell
docker run --rm --network $net curlimages/curl:8.11.1 -sS -i \
  -H "Host: app.ledger-mind.org" http://nginx:80/ready | head -n2
# HTTP/1.1 200 OK
```

## CSV upload 405 / 413 / PS curl errors

**Nginx**

- Route /ingest to backend; set upload size and disable request buffering (see block above).

**PowerShell gotchas**

- Use curl.exe (not the PS alias), and pass absolute path:

```powershell
$file = (Resolve-Path .\transactions_sample.csv).Path
curl.exe -f -sS -i -F "file=@$file;type=text/csv" "https://app.ledger-mind.org/ingest?replace=true" | Select-Object -First 5
```

## Cloudflare Tunnel

**Symptoms & fixes**

“Invalid tunnel secret” / 1033
Use a fresh token and pass via env:

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    command:
      - tunnel
      - --no-autoupdate
      - --edge-ip-version
      - "4"
      - --protocol
      - http2
      - --loglevel
      - info
      - run
```

```powershell
$env:CLOUDFLARE_TUNNEL_TOKEN="PASTE"
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate cloudflared
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs -f cloudflared
```

“You did not specify any valid additional argument”
Flags must be before run (as above).

522 from edge
Run tunnel on the compose network so nginx:80 resolves:

```powershell
$net='ai-finance-agent-oss-clean_default'
docker run -d --name cf-tunnel --restart unless-stopped --network $net \
  -e TUNNEL_TOKEN=$env:CLOUDFLARE_TUNNEL_TOKEN cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --edge-ip-version 4 --protocol http2 run
```

**Published routes**
In Zero Trust → Tunnels → Published application routes:
app.ledger-mind.org → HTTP → nginx:80 (optionally apex too).

## Docker/Compose quirks on Windows

cannot override services.ollama.gpus
Define gpus: in one file only (either base or override).

Mount host Ollama store (avoid re-pulls)

```yaml
services:
  ollama:
    volumes:
      - 'D:\\ollama:/root/.ollama'  # or 'C:\\Users\\<you>\\.ollama:/root/.ollama'
```

Ensure Docker Desktop → Resources → File Sharing includes that drive.

Attach ad-hoc containers to the compose network
Network name usually foldername_default:

```powershell
docker run --rm --network ai-finance-agent-oss-clean_default curlimages/curl:8.11.1 -sSI http://nginx:80/ready -H "Host: app.ledger-mind.org"
```

## 20-Second Smoke Checklist

```powershell
# Edge health
Invoke-WebRequest https://app.ledger-mind.org/ready   -UseBasicParsing
Invoke-WebRequest https://app.ledger-mind.org/healthz -UseBasicParsing

# API unauth (should be 401 JSON, not HTML)
Invoke-WebRequest 'https://app.ledger-mind.org/charts/month_summary?month=2025-08' -UseBasicParsing

# Upload probe (absolute path; PS uses curl.exe)
$file = (Resolve-Path .\transactions_sample.csv).Path
curl.exe -f -sS -i -F "file=@$file;type=text/csv" "https://app.ledger-mind.org/ingest?replace=true" | Select-Object -First 5

# Nginx logs
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec nginx \
  sh -lc "tail -n 80 /var/log/nginx/access.log | egrep ' /ingest|/ready|/healthz|/charts|/txns '"

# Tunnel logs (look for 4 registered connections)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs -n 50 cloudflared
```