# E2E Test Environment Configuration Guide

## Overview
This guide explains how to run E2E tests in different environments (local, staging, prod-like) and how cookie domain configuration affects test behavior.

## Environment Configurations

### Option A: Local Development (127.0.0.1)

**Backend Environment:**
```bash
COOKIE_DOMAIN=127.0.0.1
COOKIE_SECURE=0
COOKIE_SAMESITE=lax
ALLOW_DEV_ROUTES=1
ALLOW_REGISTRATION=0  # Use seed endpoint instead
```

**Test Execution:**
```bash
BASE_URL=http://127.0.0.1 pnpm -C apps/web exec playwright test tests/e2e/auth --project=chromium
```

**What Works:**
- ✅ All tests run (cookies match domain)
- ✅ Seed endpoint available (`/api/dev/seed-user`)
- ✅ No need for public registration
- ✅ CSRF cookies stored properly

**Docker Compose:**
```yaml
# docker-compose.dev.yml or override
services:
  backend:
    environment:
      COOKIE_DOMAIN: "127.0.0.1"
      COOKIE_SECURE: "0"
      COOKIE_SAMESITE: "lax"
      ALLOW_DEV_ROUTES: "1"
      ALLOW_REGISTRATION: "0"
```

---

### Option B: Staging/Prod-like (app.ledger-mind.org)

**Backend Environment:**
```bash
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1
COOKIE_SAMESITE=lax
ALLOW_DEV_ROUTES=1      # Staging only - enables seed endpoint
ALLOW_REGISTRATION=0    # Staging - use seed instead of public registration
```

**Test Execution:**
```bash
BASE_URL=https://app.ledger-mind.org pnpm -C apps/web exec playwright test tests/e2e/auth --project=chromium
```

**What Works:**
- ✅ Tests run against real domain
- ✅ Cookies work (domain matches)
- ✅ Seed endpoint available (staging only)
- ✅ Tests real SSL/TLS setup
- ✅ Tests production-like configuration

**Important Notes:**
- 🔒 Never set `ALLOW_DEV_ROUTES=1` in production
- 📝 Staging should mirror production except for dev routes
- 🧪 This tests the actual deployment configuration

---

## Cookie Domain Mismatch Behavior

### Automatic Skip Logic

Tests now gracefully skip when cookie domain doesn't match BASE_URL:

```typescript
// Example: BASE_URL=http://127.0.0.1 but COOKIE_DOMAIN=.ledger-mind.org
const host = new URL(process.env.BASE_URL ?? 'http://127.0.0.1').hostname.toLowerCase();
const cookieDomain = (process.env.COOKIE_DOMAIN ?? '').toLowerCase();
if (cookieDomain && host !== cookieDomain && !host.endsWith(cookieDomain.replace(/^\./,''))) {
  test.skip(true, `cookie Domain=${cookieDomain} doesn't match BASE_URL host=${host}`);
}
```

**Which Tests Skip:**
- ✅ `csrf-contract.spec.ts` - All tests
- ✅ `cookie-attrs.spec.ts` - All tests
- ✅ `change-password.spec.ts` - Main test
- ✅ `remember-me.spec.ts` - Main test
- ✅ `register-login.spec.ts` - Attempts seed first, skips if cookies fail
- ✅ `reset-password.spec.ts` - Skips if no token API

**Why They Skip:**
- Browser rejects cookies when domain doesn't match origin
- CSRF protection fails (no CSRF cookie)
- Session cookies aren't stored
- Auth endpoints return 403 Forbidden

---

## Pre-Flight Checklist

### Before Running Tests Locally

- [ ] Backend: `COOKIE_DOMAIN=127.0.0.1`
- [ ] Backend: `COOKIE_SECURE=0`
- [ ] Backend: `ALLOW_DEV_ROUTES=1`
- [ ] Tests: `BASE_URL=http://127.0.0.1`
- [ ] Clear browser site data (if manual testing)
- [ ] Verify backend is running: `curl http://127.0.0.1/api/ready`
- [ ] Verify seed endpoint: `curl http://127.0.0.1/api/dev/seed-user -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"Test123!"}'`

### Before Running Tests Against Staging

- [ ] Backend: `COOKIE_DOMAIN=.ledger-mind.org`
- [ ] Backend: `COOKIE_SECURE=1`
- [ ] Backend: `ALLOW_DEV_ROUTES=1` (staging only!)
- [ ] Backend: `ALLOW_REGISTRATION=0` (use seed instead)
- [ ] Tests: `BASE_URL=https://app.ledger-mind.org`
- [ ] Verify DNS resolves: `nslookup app.ledger-mind.org`
- [ ] Verify SSL: `curl -I https://app.ledger-mind.org/api/ready`
- [ ] Verify seed endpoint: `curl https://app.ledger-mind.org/api/dev/seed-user -X POST ...`

### Before Running Tests Against Production

**⚠️ WARNING: Never enable dev routes in production!**

- [ ] Backend: `COOKIE_DOMAIN=.ledger-mind.org`
- [ ] Backend: `COOKIE_SECURE=1`
- [ ] Backend: `ALLOW_DEV_ROUTES=0` ❌ **Must be disabled**
- [ ] Backend: `ALLOW_REGISTRATION=1` (or handle user creation differently)
- [ ] Tests: `BASE_URL=https://app.ledger-mind.org`
- [ ] Tests will use public registration (or skip if registration disabled)
- [ ] Consider using a separate production test user

---

## Test Execution Examples

### Run All Auth Tests (Local)
```bash
cd apps/web
BASE_URL=http://127.0.0.1 pnpm exec playwright test tests/e2e/auth/ --reporter=line
```

### Run Contract Tests Only (Staging)
```bash
cd apps/web
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --grep @auth-contract
```

### Run Specific Test with Debug
```bash
cd apps/web
BASE_URL=http://127.0.0.1 pnpm exec playwright test tests/e2e/auth/csrf-contract.spec.ts --debug
```

### Run with Headed Browser
```bash
cd apps/web
BASE_URL=http://127.0.0.1 pnpm exec playwright test tests/e2e/auth/ --headed
```

### Run and Show Report
```bash
cd apps/web
BASE_URL=http://127.0.0.1 pnpm exec playwright test tests/e2e/auth/
pnpm exec playwright show-report
```

---

## Troubleshooting

### Tests Skip with Cookie Domain Message
**Problem:** Tests skip with `cookie Domain=.ledger-mind.org doesn't match BASE_URL host=127.0.0.1`

**Solution:**
- Option A: Change backend `COOKIE_DOMAIN=127.0.0.1` for local testing
- Option B: Change test `BASE_URL=https://app.ledger-mind.org` for staging testing
- This is expected behavior - it's a safety check to avoid confusing 403 errors

### Tests Fail with 403 Forbidden
**Problem:** Tests fail with 403 on auth endpoints

**Possible Causes:**
1. Cookie domain mismatch (should be caught by skip logic now)
2. CSRF token missing or invalid
3. Session not established
4. Dev routes disabled but tests expect seed endpoint

**Debugging:**
```bash
# Check environment probe
curl http://127.0.0.1/api/dev/env

# Check CSRF endpoint
curl -c cookies.txt http://127.0.0.1/api/auth/csrf

# Check cookies
curl -b cookies.txt http://127.0.0.1/api/auth/me
```

### Seed Endpoint Returns 404
**Problem:** `/api/dev/seed-user` returns 404

**Solution:**
- Verify `ALLOW_DEV_ROUTES=1` in backend environment
- Check backend logs: `docker logs ai-finance-agent-oss-clean-backend-1`
- Verify dev router is included: check startup logs for "Loaded dev routes"
- Rebuild backend if env var changed recently

### Tests Pass Locally But Fail in CI
**Problem:** Tests work on dev machine but fail in CI pipeline

**Common Issues:**
1. CI uses different BASE_URL
2. CI backend has different COOKIE_DOMAIN
3. CI doesn't have ALLOW_DEV_ROUTES=1
4. Timing issues (backend not ready)

**CI Configuration:**
```yaml
# .github/workflows/e2e-auth-contract.yml
env:
  BASE_URL: http://127.0.0.1
  COOKIE_DOMAIN: 127.0.0.1
  # Backend service should set:
  # ALLOW_DEV_ROUTES: "1"
  # COOKIE_DOMAIN: "127.0.0.1"
  # COOKIE_SECURE: "0"
```

---

## Environment Probe Output

Every test now logs backend configuration at startup:

```
[dev-env] csrf-contract {
  app_env: 'prod',
  allow_dev_routes: true,
  allow_registration: false,
  cookie: { domain: '.ledger-mind.org', samesite: 'lax', secure: true },
  csrf_required: true
}
```

**What This Tells You:**
- `app_env`: Current environment (dev/staging/prod)
- `allow_dev_routes`: Whether seed endpoint is available
- `allow_registration`: Whether public registration works
- `cookie.domain`: Cookie domain (must match BASE_URL host)
- `cookie.secure`: Whether HTTPS-only cookies
- `csrf_required`: Whether CSRF protection is active

Use this output to diagnose why tests skip or fail!

---

## Security Notes

### Development Routes (`ALLOW_DEV_ROUTES=1`)

**Safe to Enable:**
- ✅ Local development (127.0.0.1)
- ✅ Staging environment (for testing)
- ✅ CI/CD pipelines (ephemeral environments)

**Never Enable:**
- ❌ Production
- ❌ Public-facing deployments
- ❌ Customer-accessible environments

**Protection:**
- Double-guarded: router-level + endpoint-level checks
- Returns 404 when disabled (not 403, to avoid info leak)
- No authentication bypass - creates test users only

### Cookie Security

**Local Development:**
- `COOKIE_SECURE=0` required for HTTP
- `COOKIE_DOMAIN=127.0.0.1` or omit for host-only

**Staging/Production:**
- `COOKIE_SECURE=1` required for HTTPS
- `COOKIE_DOMAIN=.ledger-mind.org` for subdomain sharing
- `COOKIE_SAMESITE=lax` or `strict` for CSRF protection

---

## Quick Reference

| Environment | BASE_URL | COOKIE_DOMAIN | COOKIE_SECURE | ALLOW_DEV_ROUTES |
|-------------|----------|---------------|---------------|------------------|
| Local | http://127.0.0.1 | 127.0.0.1 | 0 | 1 |
| Staging | https://app.ledger-mind.org | .ledger-mind.org | 1 | 1 |
| Production | https://app.ledger-mind.org | .ledger-mind.org | 1 | 0 ❌ |

## Related Documentation

- [DEV-ENV-PROBE.md](./DEV-ENV-PROBE.md) - Environment diagnostic endpoint
- [../../backend/README.md](../../backend/README.md) - Backend configuration
- [../playwright.config.ts](../playwright.config.ts) - Test runner configuration
