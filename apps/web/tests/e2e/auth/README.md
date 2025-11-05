# Authentication E2E Tests

This directory contains end-to-end tests for the authentication system, covering the complete auth flow from registration to password management.

## Test Coverage

### 1. **Register → Login → /me** (`register-login.spec.ts`)
- Verifies registration flow (or gracefully skips if disabled)
- Validates login sets session + CSRF cookies
- Confirms `/api/auth/me` returns 200 with authenticated user

### 2. **Remember Me** (`remember-me.spec.ts`)
- Tests session persistence via refresh token
- Simulates browser restart with saved storage state
- Validates refresh token flow works across contexts

### 3. **Change Password** (`change-password.spec.ts`)
- Tests password rotation flow
- Confirms old credentials fail after change
- Validates new credentials work correctly

### 4. **Reset Password** (`reset-password.spec.ts`)
- Tests forgot password → reset password flow
- Skips gracefully if dev token endpoint not available
- Validates token-based password reset

### 5. **CSRF Contract** (`csrf-contract.spec.ts`) `@auth-contract`
- Enforces CSRF double-submit cookie protection
- Validates 403 returned when CSRF token missing
- Confirms CSRF check passes with valid token (returns 401 for auth failure, not 403 for CSRF failure)
- **Requires:** `BASE_URL` domain must match backend's `COOKIE_DOMAIN`

### 6. **Cookie Attributes Contract** (`cookie-attrs.spec.ts`) `@auth-contract`
- Validates auth cookies have correct security attributes
- Checks Domain, Secure, SameSite flags
- Confirms session and CSRF cookies are both set
- **Requires:** `BASE_URL` domain must match backend's `COOKIE_DOMAIN`

## Running Tests

### Local Development

```powershell
# Set BASE_URL to your local environment
$env:BASE_URL = "http://127.0.0.1"

# Run all auth tests
pnpm -C apps/web exec playwright test tests/e2e/auth --project=chromium --workers=4 --reporter=line

# Run contract tests only
pnpm -C apps/web exec playwright test --grep @auth-contract

# Run specific test
pnpm -C apps/web exec playwright test tests/e2e/auth/register-login.spec.ts

# Debug mode (headed, slow-mo)
pnpm -C apps/web exec playwright test tests/e2e/auth --headed --debug
```

### Against Production

```powershell
# Test against production environment
$env:BASE_URL = "https://app.ledger-mind.org"
pnpm -C apps/web exec playwright test tests/e2e/auth --project=chromium
```

### Contract Tests with Cookie Domain
The `@auth-contract` tests validate security contracts (CSRF, cookie attributes). They **require** `BASE_URL` hostname to match the backend's `COOKIE_DOMAIN` setting, otherwise cookies won't be accepted by the browser and tests will skip gracefully.

**Local testing options:**

Option 1: Clear `COOKIE_DOMAIN` (recommended):
```powershell
# In docker-compose.yml or backend .env, set:
# COOKIE_DOMAIN=  # Empty - allows host-only cookies

$env:BASE_URL = "http://127.0.0.1:8080"
pnpm -C apps/web exec playwright test --grep @auth-contract
```

Option 2: Add hosts file entry:
```powershell
# Add to C:\Windows\System32\drivers\etc\hosts:
# 127.0.0.1  local.ledger-mind.org

$env:BASE_URL = "http://local.ledger-mind.org:8080"
pnpm -C apps/web exec playwright test --grep @auth-contract
```

**Production testing:**
```powershell
$env:BASE_URL = "https://ledger-mind.org"
pnpm -C apps/web exec playwright test --grep @auth-contract
```

## Graceful Skipping

All tests skip gracefully when:
- Features are disabled (`ALLOW_REGISTRATION=false`)
- Dev routes not enabled (`ALLOW_DEV_ROUTES` not set)
- Cookie domain mismatch (contract tests only)
- Dev endpoints unavailable (reset-password only)

Tests will show as "skipped" with a descriptive reason rather than failing.

## Dev Seed Endpoint

To enable E2E tests without requiring public registration, use the `/api/dev/seed-user` endpoint:

**Backend setup:**
```bash
# Set in backend environment (docker-compose or .env)
ALLOW_DEV_ROUTES=1
```

**How it works:**
1. Tests first try `/api/dev/seed-user` to create test users
2. If dev routes disabled (404), fall back to `/api/auth/register`
3. If both unavailable, tests skip gracefully

**Security:** The seed endpoint is guarded by `ALLOW_DEV_ROUTES=1` and returns 404 unless explicitly enabled. Never enable in production.

**Usage in tests:**
```typescript
const seed = await page.request.post('/api/dev/seed-user', {
  headers: { 'Content-Type': 'application/json' },
  data: { email, password }
});
if (seed.status() === 404) {
  // Fallback to register or skip
}
```



## Environment Variables

- `BASE_URL` - Base URL for tests (default: `http://127.0.0.1`)
- `E2E_EMAIL` - Email for global setup (default: `e2e@example.com`)
- `E2E_PASSWORD` - Password for global setup (default: `e2e-password`)
- `PW_WORKERS` - Number of parallel workers (default: 24)
- `PW_SKIP_WS` - Skip web server startup if already running

## Test Strategy

### CSRF Protection
All tests use helper functions to automatically:
1. Bootstrap CSRF token via `/api/auth/csrf`
2. Extract token from cookies
3. Include in `X-CSRF-Token` header for POST requests

### Graceful Skipping
Tests automatically skip when:
- Registration is disabled (`ALLOW_REGISTRATION=false`)
- Dev endpoints are not available (reset password flow)
- User preparation fails (change password test)

This ensures tests don't fail in production environments with restricted features.

### Dynamic Email Generation
Each test run generates unique emails using timestamps to avoid collisions:
```typescript
const email = `e2e+${Date.now()}@example.com`;
```

## Cookie Validation

Tests verify that after login:
- Session cookie exists (`access_token` or `refresh_token`)
- CSRF token cookie exists and is accessible
- Cookies have correct attributes (domain, secure, samesite)

## Expected Status Codes

| Endpoint | Success | Registration Disabled | Invalid Creds |
|----------|---------|----------------------|---------------|
| `/api/auth/register` | 200/201 | 403 | 400 |
| `/api/auth/login` | 200 | N/A | 401 |
| `/api/auth/me` | 200 | N/A | 401 |
| `/api/auth/refresh` | 200 | N/A | 401 |
| `/api/auth/change-password` | 200/204 | N/A | 401 |
| `/api/auth/forgot-password` | 200 | N/A | 200* |
| `/api/auth/reset-password` | 200/204 | N/A | 400 |

*Forgot password always returns 200 to prevent email enumeration.

## Debugging

### View test results
```powershell
pnpm -C apps/web exec playwright show-report
```

### Run with UI mode
```powershell
pnpm -C apps/web exec playwright test tests/e2e/auth --ui
```

### Trace viewer (on failure)
```powershell
pnpm -C apps/web exec playwright show-trace <trace-file>
```

## CI/CD Integration

Tests are configured to run in CI with:
- HTML + line reporters
- Trace retention on failure
- Screenshot capture on failure
- Headless browser mode

## Global Setup

The global setup (`tests/e2e/.auth/global-setup.ts`) pre-authenticates a test user and saves storage state to `tests/e2e/.auth/state.json`. This:
- Speeds up test execution (no repeated auth)
- Reduces load on auth endpoints
- Provides consistent authenticated state

To bypass global setup (test unauthenticated flows):
```typescript
test.use({ storageState: undefined });
```

## Test Data Cleanup

Tests create ephemeral users with timestamped emails. For production, consider:
- Periodic cleanup of `e2e+*@example.com` users
- Dedicated test database for E2E runs
- Test user auto-expiration policy
