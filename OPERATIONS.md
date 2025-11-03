# Operations / Security Hardening

### Security hardening — web / edge

- [ ] CSP
  - [ ] `script-src 'self'` plus hashes injected (no literal `__INLINE_SCRIPT_HASHES__` in final config).
  - [ ] `style-src 'self'` (no `'unsafe-inline'` unless strictly required).
  - [ ] `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- [ ] Referrer policy: `Referrer-Policy: strict-origin-when-cross-origin` (consider `no-referrer` if acceptable).
- [ ] Permissions policy: disable unused features (camera, microphone, geolocation, payment, etc.).
- [ ] X headers: `X-Content-Type-Options: nosniff`, rely on CSP `frame-ancestors` instead of legacy `X-Frame-Options` (or set `DENY` for legacy clients), explicitly no legacy XSS filter: `X-XSS-Protection: 0`.
- [ ] HSTS (prod only, after TLS verified): `Strict-Transport-Security: max-age=15552000; includeSubDomains; preload`.
- [ ] Nginx `/api/metrics` alias returns 307 → `/metrics` (compat guard).
- [ ] Cloudflare
  - [ ] Tunnel routes pinned to origin container (nginx:80).
  - [ ] Cache rules: HTML no-store / revalidate, assets long-cache immutable (1y + `immutable`).
- [ ] CI guards
  - [ ] CSP render job fails if placeholder remains.
  - [ ] Build uses `nginx.conf.rendered` preferentially (Dockerfile logic).
  - [ ] Artifact: inline script hash manifest uploaded per build.

### Optional CI add-on — ensure rendered config used in image

After building the nginx image (tag as `$IMG`):

```bash
CID=$(docker create $IMG)
docker cp "$CID:/etc/nginx/nginx.conf" ./_ci_nginx.conf
docker rm "$CID" >/dev/null
if grep -q "__INLINE_SCRIPT_HASHES__" ./_ci_nginx.conf; then
  echo "ERROR: Placeholder survived inside the built image"; exit 1;
fi
```

### One-liner local verify (PowerShell)

```powershell
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
pnpm run csp:hash
docker --context desktop-linux compose $FILES build nginx
docker --context desktop-linux compose $FILES up -d nginx
curl.exe -s -o NUL -w "READY %{http_code}`n" http://127.0.0.1:8080/ready
curl.exe -sI http://127.0.0.1:8080/ | findstr /i "content-security-policy"
curl.exe -sI http://127.0.0.1:8080/api/metrics | findstr /i "HTTP/1.1 307"
curl.exe -sI http://127.0.0.1:8080/api/metrics | findstr /i "location:"
```

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Placeholder still in running container | Forgot to run `csp:hash` before image build | Re-run hash render, rebuild image |
| Missing styles after removing `'unsafe-inline'` | Runtime style injection by a library | Add nonce-based style allowance or refactor offending library |
| CSP violations for OpenAI | `connect-src` missing `https://api.openai.com` | Add domain to connect-src (already present) |
| Empty hash manifest | No inline scripts (expected) | No action needed; may remove placeholder later |

### De-escalation path
If the pipeline breaks due to CSP during an incident, short-term mitigation:
1. Rebuild `deploy/nginx.conf` with a temporary appended source: `script-src 'self' 'unsafe-inline'` (DO NOT commit long-term unless root cause understood).
2. Add incident note referencing violation reports (Report-To group `csp`).
3. Revert to hash-only mode post-fix.
