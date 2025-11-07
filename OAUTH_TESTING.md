# OAuth Testing & Deployment Guide

Complete guide for testing and deploying Google OAuth authentication.

---

## 🧪 Testing Checklist

### Local Development Testing

#### 1. Backend Smoke Test
```powershell
# Start backend
cd apps\backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# In another terminal, run regression test
.\scripts\auth\regress.ps1

# Expected output:
# ✓ Health OK
# ✓ Correctly returns 401 (No session)
# ✓ Redirects to Google OAuth
# Manual login URL displayed
```

#### 2. Manual OAuth Flow Test
```powershell
# 1. Test /auth/me before login (should fail)
try {
    Invoke-RestMethod http://127.0.0.1:8000/auth/me
} catch {
    Write-Host "Expected 401: $($_.Exception.Response.StatusCode.value__)"
}

# 2. Open login URL in browser
Start-Process "http://127.0.0.1:8000/auth/google/login"

# 3. Complete Google sign-in in browser

# 4. Test /auth/me after login (should succeed)
Invoke-RestMethod http://127.0.0.1:8000/auth/me

# Expected response:
# {
#   "sub": "google_user_id",
#   "email": "your@email.com",
#   "name": "Your Name",
#   "picture": "https://...",
#   "iss": "google"
# }
```

#### 3. Frontend Component Test
```powershell
# Start frontend dev server
cd apps\web
pnpm dev

# Open http://localhost:5173 in browser
# Before login: Should see "Sign in with Google" button
# After login: Should see profile picture, name, and logout button
```

#### 4. Playwright E2E Tests
```powershell
cd apps\web

# Install Playwright if not already installed
pnpm create playwright --yes
pnpm exec playwright install --with-deps chromium

# Run auth smoke tests
pnpm exec playwright test tests/auth.spec.ts --reporter=line

# Run with UI mode for debugging
pnpm exec playwright test tests/auth.spec.ts --ui
```

---

## 🔐 Security Testing

### 1. Cookie Security Verification
```powershell
# Start backend with production-like settings
$env:COOKIE_SECURE = "1"
$env:COOKIE_DOMAIN = ".ledger-mind.org"

# Check Set-Cookie header after login
# Should contain: Domain=.ledger-mind.org; Secure; HttpOnly; SameSite=Lax
```

### 2. CSRF Protection Test
```powershell
# Test callback with invalid state (should fail)
Invoke-WebRequest "http://127.0.0.1:8000/auth/google/callback?state=invalid&code=test" -MaximumRedirection 0

# Expected: 400 Bad Request "Invalid state"
```

### 3. Session Token Tampering Test
```powershell
# Manually set an invalid session cookie
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("lm_session", "tampered_token", "/", "127.0.0.1")
$session.Cookies.Add($cookie)

# Try to access /auth/me with tampered cookie
try {
    Invoke-RestMethod http://127.0.0.1:8000/auth/me -WebSession $session
} catch {
    # Expected: 401 Invalid session
    Write-Host "Correctly rejected tampered token: $($_.Exception.Response.StatusCode.value__)"
}
```

---

## 🚀 Production Deployment

### Pre-Deployment Checklist

- [ ] **Google OAuth credentials** obtained for production domain
- [ ] **Redirect URI** whitelisted: `https://app.ledger-mind.org/auth/google/callback`
- [ ] **Strong SESSION_SECRET** generated (32+ random characters)
- [ ] **Environment variables** configured in secrets manager/docker-compose
- [ ] **Nginx configuration** updated with OAuth proxy rules
- [ ] **CSP headers** allow Google OAuth domains
- [ ] **SSL/TLS** enabled (COOKIE_SECURE=1)

### Environment Variables (Production)

```bash
# Backend environment
OAUTH_GOOGLE_CLIENT_ID=<prod_client_id>.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=<prod_secret>
OAUTH_REDIRECT_URL=https://app.ledger-mind.org/auth/google/callback
SESSION_SECRET=<strong_random_32+_char_string>
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1
```

### Deployment Steps

#### 1. Update Docker Compose / K8s

**docker-compose.prod.yml:**
```yaml
services:
  backend:
    image: ghcr.io/leok974/ai-finance-agent-backend:latest
    environment:
      OAUTH_GOOGLE_CLIENT_ID: ${OAUTH_GOOGLE_CLIENT_ID}
      OAUTH_GOOGLE_CLIENT_SECRET: ${OAUTH_GOOGLE_CLIENT_SECRET}
      OAUTH_REDIRECT_URL: https://app.ledger-mind.org/auth/google/callback
      SESSION_SECRET: ${SESSION_SECRET}
      COOKIE_DOMAIN: .ledger-mind.org
      COOKIE_SECURE: "1"
    # ... other config
```

#### 2. Update Nginx Configuration

Add OAuth proxy configuration (see `OAUTH_NGINX.md` for full example):
```nginx
location /auth/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Cookie $http_cookie;
    proxy_pass_header Set-Cookie;
}
```

#### 3. Deploy Backend

```bash
# Pull latest images
docker compose -f ops/docker-compose.prod.yml pull

# Restart backend with new env vars
docker compose -f ops/docker-compose.prod.yml up -d backend

# Check logs
docker compose -f ops/docker-compose.prod.yml logs -f backend
```

#### 4. Reload Nginx

```bash
docker compose -f ops/docker-compose.prod.yml exec nginx nginx -t
docker compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload
```

#### 5. Verify Deployment

```powershell
# Run regression test against production
.\scripts\auth\regress.ps1 -Base "https://app.ledger-mind.org"

# Expected output:
# ✓ Health OK
# ✓ Correctly returns 401 (No session)
# ✓ Redirects to Google OAuth
```

---

## 🔍 Production Verification

### 1. Health Check
```bash
curl https://app.ledger-mind.org/health
# Expected: {"ok": true}
```

### 2. OAuth Endpoint Accessibility
```bash
# Test /auth/me (should return 401 without session)
curl -i https://app.ledger-mind.org/auth/me

# Test login redirect (should redirect to Google)
curl -I https://app.ledger-mind.org/auth/google/login
# Expected: Location: https://accounts.google.com/...
```

### 3. Cookie Verification

After manual login via browser:
```bash
# Check Set-Cookie header
curl -i https://app.ledger-mind.org/auth/google/callback?code=...&state=...

# Expected Set-Cookie attributes:
# - Domain=.ledger-mind.org
# - Secure
# - HttpOnly
# - SameSite=Lax
# - Path=/
```

### 4. Frontend Component Check

Open `https://app.ledger-mind.org` in browser:
- Before login: "Sign in with Google" button visible
- After login: Profile picture and name displayed
- Logout button functional

---

## 🐛 Troubleshooting Guide

### Issue: "redirect_uri_mismatch" in Google OAuth

**Symptoms**: Error page from Google after clicking "Sign in with Google"

**Cause**: Redirect URI not whitelisted in Google Cloud Console

**Fix**:
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client ID
3. Add exact callback URL to "Authorized redirect URIs":
   - Dev: `http://127.0.0.1:8000/auth/google/callback`
   - Prod: `https://app.ledger-mind.org/auth/google/callback`
4. Save and retry

---

### Issue: Cookie not setting after login

**Symptoms**: `/auth/me` still returns 401 after successful Google login

**Diagnosis**:
```bash
# Check Set-Cookie header
curl -i https://app.ledger-mind.org/auth/google/callback?code=test&state=test

# Look for Set-Cookie: lm_session=... in response headers
```

**Common Causes & Fixes**:

1. **Wrong COOKIE_DOMAIN**
   - Symptom: Cookie not sent by browser
   - Fix: Set `COOKIE_DOMAIN=.ledger-mind.org` (with leading dot)

2. **COOKIE_SECURE mismatch**
   - Symptom: Cookie set on HTTP but not HTTPS (or vice versa)
   - Fix: Dev: `COOKIE_SECURE=0`, Prod: `COOKIE_SECURE=1`

3. **Nginx not proxying cookies**
   - Symptom: Set-Cookie header missing in response
   - Fix: Add to Nginx config:
     ```nginx
     proxy_set_header Cookie $http_cookie;
     proxy_pass_header Set-Cookie;
     ```

---

### Issue: "401 Invalid session" with valid cookie

**Symptoms**: `/auth/me` returns 401 even with `lm_session` cookie

**Cause**: SESSION_SECRET changed or cookie signed with different secret

**Fix**:
1. Verify SESSION_SECRET matches across all backend instances
2. Clear browser cookies and re-login
3. Check backend logs for signature validation errors

---

### Issue: 502 Bad Gateway on /auth/*

**Symptoms**: Nginx returns 502 for OAuth endpoints

**Diagnosis**:
```bash
# Check backend is running
docker compose -f ops/docker-compose.prod.yml ps backend

# Check Nginx can reach backend
docker compose -f ops/docker-compose.prod.yml exec nginx curl http://backend:8000/health
```

**Fix**:
1. Verify backend service name in `proxy_pass` matches docker-compose service name
2. Check backend container is healthy
3. Verify network connectivity between Nginx and backend

---

## 📊 Monitoring

### Key Metrics to Track

1. **OAuth Login Success Rate**
   ```sql
   -- Count successful logins (if you add logging)
   SELECT COUNT(*) FROM auth_logs WHERE event='login_success' AND timestamp > NOW() - INTERVAL '24 hours';
   ```

2. **Session Cookie Errors**
   - Monitor 401 responses to `/auth/me`
   - Alert if error rate > 5%

3. **OAuth Callback Failures**
   - Monitor 400 responses to `/auth/google/callback`
   - Common causes: state mismatch, PKCE failures

### Logging Recommendations

Add structured logging to OAuth flow:

```python
# In app/auth/google.py
import logging

logger = logging.getLogger(__name__)

@router.get("/callback")
async def callback(request: Request):
    try:
        # ... existing code
        logger.info(f"OAuth login successful: {userinfo.get('email')}")
    except Exception as e:
        logger.error(f"OAuth callback failed: {str(e)}", exc_info=True)
        raise
```

---

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The `auth-smoke.yml` workflow runs automatically on:
- Pull requests
- Manual trigger via workflow_dispatch

**What it tests**:
1. Backend starts successfully with OAuth dependencies
2. Health endpoint responds
3. `/auth/me` returns 401 without session (correct behavior)
4. `/auth/google/login` redirects to Google

**Required secrets** (none for smoke test, uses dummy credentials):
- For full E2E with real OAuth: Add `OAUTH_GOOGLE_TEST_CLIENT_ID` and `OAUTH_GOOGLE_TEST_CLIENT_SECRET` as GitHub secrets

### Adding to Required Checks

In your repository settings:
1. Go to Settings → Branches → Branch protection rules
2. Add `auth-smoke` to required status checks
3. Ensures OAuth endpoints don't break in PRs

---

## 📝 Post-Deployment Validation

### Day 1 Checklist

- [ ] Run regression test: `.\scripts\auth\regress.ps1 -Base "https://app.ledger-mind.org"`
- [ ] Test full login flow in browser (incognito mode)
- [ ] Verify profile picture and name display correctly
- [ ] Test logout functionality
- [ ] Check browser cookies: `lm_session` has correct attributes
- [ ] Monitor error logs for 401/400 errors
- [ ] Verify `/auth/me` works after login

### Week 1 Checklist

- [ ] Check user adoption rate
- [ ] Monitor session expiration issues
- [ ] Review error logs for OAuth failures
- [ ] Test from different browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test from mobile devices
- [ ] Verify GDPR compliance (if applicable): user consent for Google OAuth

---

## 🎯 Success Criteria

OAuth implementation is considered successful when:

1. **Functional**:
   - ✅ Users can sign in with Google
   - ✅ Profile info displayed correctly
   - ✅ Logout clears session
   - ✅ Protected routes work with session guard

2. **Secure**:
   - ✅ CSRF protection active (state validation)
   - ✅ PKCE enabled
   - ✅ Cookies have correct security attributes
   - ✅ Session tokens tamper-proof (signed)

3. **Reliable**:
   - ✅ CI tests pass
   - ✅ No 502/503 errors on OAuth endpoints
   - ✅ Session persistence across page refreshes
   - ✅ Error rate < 1%

4. **User Experience**:
   - ✅ Login flow completes in < 10 seconds
   - ✅ No confusing error messages
   - ✅ AuthMenu component displays correctly
   - ✅ Mobile-responsive

---

## 📚 Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Authlib Documentation](https://docs.authlib.org/)
- [Playwright Testing](https://playwright.dev/docs/intro)

---

## 🆘 Getting Help

If you encounter issues not covered in this guide:

1. Check backend logs: `docker compose logs -f backend`
2. Check Nginx logs: `docker compose logs -f nginx`
3. Run regression test with verbose output
4. Review browser console for JavaScript errors
5. Check browser Network tab for failed requests
6. Create GitHub issue with:
   - Error message
   - Steps to reproduce
   - Environment (dev/prod, browser, OS)
   - Relevant log snippets
