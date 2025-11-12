# OAuth Nginx Configuration

Add these location blocks to your Nginx site configuration to proxy OAuth endpoints.

## Configuration Snippet

```nginx
# === OAuth Endpoints ===
# Proxy all /auth/* routes to backend
location /auth/ {
    proxy_pass http://backend:8000;  # Adjust to your backend service name
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Cookie forwarding
    proxy_set_header Cookie $http_cookie;
    proxy_pass_header Set-Cookie;

    # Disable buffering for SSE/streaming (if needed later)
    proxy_buffering off;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}

# Explicit /auth/me endpoint (redundant with /auth/* but explicit for clarity)
location = /auth/me {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_pass_header Set-Cookie;
}
# === /OAuth Endpoints ===
```

## Full Example

If you have a complete site config like `nginx/conf.d/app.conf`, add the OAuth section:

```nginx
server {
    listen 443 ssl http2;
    server_name app.ledger-mind.org;

    ssl_certificate /etc/letsencrypt/live/ledger-mind.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ledger-mind.org/privkey.pem;

    root /var/www/html;
    index index.html;

    # Frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # === OAuth Endpoints (NEW) ===
    location /auth/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }
    # === /OAuth Endpoints ===
}
```

## Environment Variables for Production

Ensure your backend container has these environment variables:

```yaml
# docker-compose.prod.yml or k8s ConfigMap
services:
  backend:
    environment:
      # OAuth
      OAUTH_GOOGLE_CLIENT_ID: ${OAUTH_GOOGLE_CLIENT_ID}
      OAUTH_GOOGLE_CLIENT_SECRET: ${OAUTH_GOOGLE_CLIENT_SECRET}
      OAUTH_REDIRECT_URL: https://app.ledger-mind.org/auth/google/callback

      # Cookies (Production)
      SESSION_SECRET: ${SESSION_SECRET}  # Strong random string (32+ chars)
      COOKIE_DOMAIN: .ledger-mind.org    # Allows subdomain sharing
      COOKIE_SECURE: "1"                 # HTTPS only
```

## Testing

After applying the Nginx config:

```bash
# Reload Nginx
docker compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload

# Test OAuth endpoints
curl -I https://app.ledger-mind.org/health
curl -I https://app.ledger-mind.org/auth/me  # Should return 401 without cookie

# Test redirect
curl -I https://app.ledger-mind.org/auth/google/login  # Should redirect to Google
```

## Security Headers

OAuth endpoints inherit your site's security headers. Ensure CSP allows Google OAuth:

```nginx
# Add to your security headers config
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com;
    img-src 'self' data: https: blob:;
    frame-ancestors 'none';
" always;
```

## Troubleshooting

### Issue: "redirect_uri_mismatch"
**Cause**: OAuth callback URL not whitelisted in Google Console
**Fix**: Add `https://app.ledger-mind.org/auth/google/callback` to authorized redirect URIs

### Issue: Cookie not setting
**Cause**: Domain mismatch or missing Secure flag
**Fix**:
- Ensure `COOKIE_DOMAIN=.ledger-mind.org` (with leading dot)
- Ensure `COOKIE_SECURE=1` for HTTPS
- Check `Set-Cookie` header: `Set-Cookie: lm_session=...; Domain=.ledger-mind.org; Secure; HttpOnly; SameSite=Lax`

### Issue: 502 Bad Gateway on /auth/*
**Cause**: Backend not reachable or service name mismatch
**Fix**: Check `proxy_pass` points to correct backend service (e.g., `http://backend:8000` or `http://portfolio-api.int:8000`)

## Verification Checklist

- [ ] Nginx config includes `/auth/` location block
- [ ] Backend environment variables set (OAUTH_*, SESSION_SECRET, COOKIE_*)
- [ ] Google OAuth redirect URI whitelisted
- [ ] CSP allows Google OAuth domains
- [ ] Test `/auth/google/login` redirects to Google
- [ ] Test `/auth/me` returns 401 without cookie
- [ ] Test full login flow sets `lm_session` cookie
- [ ] Cookie has correct attributes: `Domain=.ledger-mind.org; Secure; HttpOnly; SameSite=Lax`
