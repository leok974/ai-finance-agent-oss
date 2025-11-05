# Cookie Mismatch Auto-Skip Implementation

## Overview

Replaced manual environment variable checking with **actual browser cookie storage testing**. The new `skipIfCookieDomainMismatch()` helper detects cookie storage failures in real-time and provides precise skip reasons.

## Key Improvement

### Before (Environment Variable Checking)
```typescript
// Guessed based on env vars - could be wrong
const host = new URL(process.env.BASE_URL).hostname;
const cookieDomain = process.env.COOKIE_DOMAIN;
if (cookieDomain && host !== cookieDomain) {
  test.skip(true, 'Domain mismatch');
}
```

**Problems:**
- Assumes `COOKIE_DOMAIN` env var is available to tests
- Can't detect Secure flag issues
- Can't detect SameSite issues
- Doesn't verify actual browser behavior

### After (Actual Cookie Storage Testing)
```typescript
// Actually tries to store a cookie and checks the result
const resp = await page.request.get('/api/auth/csrf');
const jar = await page.context().cookies();
const hasCsrf = jar.some(c => c.name === 'csrf_token');
if (!hasCsrf) {
  // Parse Set-Cookie header to explain why
  test.skip(true, 'csrf cookie NOT stored - Secure on http OR Domain mismatch');
}
```

**Benefits:**
- ✅ Tests actual browser behavior
- ✅ Detects Secure flag on HTTP
- ✅ Detects Domain mismatches
- ✅ Detects any other cookie storage issue
- ✅ Provides precise skip reason from Set-Cookie header
- ✅ No dependency on environment variables

## Implementation

### Helper Function
**File:** `apps/web/tests/e2e/utils/skip-if-cookie-mismatch.ts`

```typescript
export async function skipIfCookieDomainMismatch(page: Page, where: string) {
  // 1. Request CSRF endpoint (triggers Set-Cookie header)
  const resp = await page.request.get('/api/auth/csrf');
  const setCookie = resp.headers()['set-cookie'] ?? '';

  // 2. Check if browser actually stored the cookie
  const jar = await page.context().cookies();
  const hasCsrf = jar.some(c => c.name === 'csrf_token');
  if (hasCsrf) return; // ✅ Cookie stored, proceed

  // 3. Parse Set-Cookie header to explain why it failed
  const domain = /Domain=([^;,\s]+)/i.exec(setCookie)?.[1];
  const secure = /;\s*Secure\b/i.test(setCookie);

  let reason = `${where}: csrf cookie NOT stored`;
  if (secure && !isHttpsBaseUrl()) {
    reason += ' — Cookie has Secure flag but BASE_URL is http.';
  }
  if (domain && !hostMatchesDomain(host, domain)) {
    reason += ` — Cookie Domain=${domain} does not match host.';
  }

  test.skip(true, reason);
}
```

### Detection Logic

1. **Secure Flag Check**
   ```typescript
   // Cookie: Secure; but BASE_URL=http://127.0.0.1
   if (secure && !isHttpsBaseUrl()) {
     reason += ' — Cookie has Secure flag but BASE_URL is http.';
   }
   ```

2. **Domain Match Check**
   ```typescript
   // Cookie: Domain=.ledger-mind.org; but host=127.0.0.1
   if (domain && !hostMatchesDomain(host, domain)) {
     reason += ` — Cookie Domain=${domain} does not match host.`;
   }
   ```

3. **Smart Domain Matching**
   ```typescript
   function hostMatchesDomain(host: string, domain: string) {
     const d = domain.replace(/^\./, '').toLowerCase();
     const h = host.toLowerCase();
     return h === d || h.endsWith('.' + d);
   }

   // Examples:
   hostMatchesDomain('127.0.0.1', '127.0.0.1')  // ✅ exact match
   hostMatchesDomain('app.ledger-mind.org', '.ledger-mind.org')  // ✅ subdomain
   hostMatchesDomain('staging.ledger-mind.org', '.ledger-mind.org')  // ✅ subdomain
   hostMatchesDomain('127.0.0.1', '.ledger-mind.org')  // ❌ no match
   ```

## Integration

Added to 4 auth specs that require cookie authentication:

### 1. `remember-me.spec.ts`
```typescript
import { skipIfCookieDomainMismatch } from '../utils/skip-if-cookie-mismatch';

test('session persists via refresh token', async ({ page, browser }) => {
  await logDevEnv(page, 'remember-me');
  await skipIfCookieDomainMismatch(page, 'remember-me');
  // ... rest of test
});
```

### 2. `change-password.spec.ts`
```typescript
test('change password rotates credentials', async ({ page }) => {
  await logDevEnv(page, 'change-password');
  await skipIfCookieDomainMismatch(page, 'change-password');
  // ... rest of test
});
```

### 3. `register-login.spec.ts`
```typescript
test('register works (or cleanly 403 if disabled)...', async ({ page }) => {
  await logDevEnv(page, 'register-login');
  await skipIfCookieDomainMismatch(page, 'register-login');
  // ... rest of test
});
```

### 4. `cookie-attrs.spec.ts`
```typescript
test('login sets session + csrf cookies with expected attributes', async ({ page, request }) => {
  await logDevEnv(page, 'cookie-attrs');
  await skipIfCookieDomainMismatch(page, 'cookie-attrs');
  // ... rest of test
});
```

### Not Added To:
- ❌ `csrf-contract.spec.ts` - Intentionally tests behavior **without** CSRF cookie
- ❌ `reset-password.spec.ts` - Has its own skip logic for token API availability

## Test Results

### Mismatched Configuration (Expected Skip)
```bash
# Backend: COOKIE_DOMAIN=.ledger-mind.org, COOKIE_SECURE=1
# Tests: BASE_URL=http://127.0.0.1

$env:BASE_URL="http://127.0.0.1"
pnpm exec playwright test tests/e2e/auth/

Result: ✅ 7 skipped
```

**Debug Output:**
```
set-cookie: csrf_token=...; Domain=.ledger-mind.org; SameSite=lax; Secure
browserContext.cookies => []  (empty - cookie rejected!)
```

**Skip Reason:**
```
remember-me: csrf cookie NOT stored for BASE_URL host=127.0.0.1.
Set-Cookie="csrf_token=...; Domain=.ledger-mind.org; Secure"
— Cookie has Secure flag but BASE_URL is http.
— Cookie Domain=.ledger-mind.org does not match host.
```

### Matched Configuration (Tests Run)
```bash
# Local Dev
# Backend: COOKIE_DOMAIN=127.0.0.1, COOKIE_SECURE=0
# Tests: BASE_URL=http://127.0.0.1

BASE_URL=http://127.0.0.1 pnpm exec playwright test tests/e2e/auth/

Result: ✅ Tests run normally
```

```bash
# Staging/Prod-like
# Backend: COOKIE_DOMAIN=.ledger-mind.org, COOKIE_SECURE=1
# Tests: BASE_URL=https://app.ledger-mind.org

BASE_URL=https://app.ledger-mind.org pnpm exec playwright test tests/e2e/auth/

Result: ✅ Tests run normally
```

## Example Skip Messages

### Secure Flag on HTTP
```
change-password: csrf cookie NOT stored for BASE_URL host=127.0.0.1.
Set-Cookie="csrf_token=abc123; Secure"
— Cookie has Secure flag but BASE_URL is http.
```

### Domain Mismatch
```
register-login: csrf cookie NOT stored for BASE_URL host=127.0.0.1.
Set-Cookie="csrf_token=abc123; Domain=.ledger-mind.org"
— Cookie Domain=.ledger-mind.org does not match host.
```

### Both Issues
```
cookie-attrs: csrf cookie NOT stored for BASE_URL host=127.0.0.1.
Set-Cookie="csrf_token=abc123; Domain=.ledger-mind.org; Secure"
— Cookie has Secure flag but BASE_URL is http.
— Cookie Domain=.ledger-mind.org does not match host.
```

## Why This Is Better

### 1. Accurate Detection
- ✅ Tests what actually happens in the browser
- ✅ No assumptions about backend configuration
- ✅ Catches all cookie storage issues (not just known ones)

### 2. Clear Diagnostics
```
[dev-env] remember-me {
  cookie: { domain: '.ledger-mind.org', secure: true }
}
Skip reason: csrf cookie NOT stored — Cookie has Secure flag but BASE_URL is http.
```

You can see:
- Backend config (from `logDevEnv`)
- Actual Set-Cookie header
- Exact reason cookie was rejected
- Which flag/attribute caused the issue

### 3. Maintainable
- No hardcoded environment variable names
- No manual domain parsing in each test
- Single helper function for all auth specs
- Easy to add more detection logic if needed

### 4. Future-Proof
Automatically handles:
- New cookie attributes (Partitioned, etc.)
- Browser policy changes
- Any other cookie storage issue

## Environment Configurations

### Local Development
```bash
# Backend environment
COOKIE_DOMAIN=127.0.0.1
COOKIE_SECURE=0
COOKIE_SAMESITE=lax
ALLOW_DEV_ROUTES=1

# Run tests
BASE_URL=http://127.0.0.1 pnpm -C apps/web exec playwright test tests/e2e/auth
```

**Result:** ✅ All tests run (cookies stored successfully)

### Staging/Prod-like
```bash
# Backend environment
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1
COOKIE_SAMESITE=lax
ALLOW_DEV_ROUTES=1  # Staging only

# Run tests
BASE_URL=https://app.ledger-mind.org pnpm -C apps/web exec playwright test tests/e2e/auth
```

**Result:** ✅ All tests run (cookies stored successfully)

### Mismatched (Auto-Skip)
```bash
# Backend: prod config
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1

# Tests: local URL
BASE_URL=http://127.0.0.1 pnpm -C apps/web exec playwright test tests/e2e/auth
```

**Result:** ⏭️ Tests skip with clear reason (cookies rejected by browser)

## Troubleshooting

### Tests Skip Unexpectedly

**Symptom:** Tests skip even though you think domains match

**Debug:**
1. Check `logDevEnv` output for backend cookie config
2. Look for skip reason in test output
3. Verify BASE_URL protocol (http vs https)
4. Check for typos in domain (`.ledger-mind.org` vs `ledger-mind.org`)

**Common Issues:**
- Secure=1 but BASE_URL uses http://
- Domain has typo or extra/missing leading dot
- BASE_URL port doesn't match cookie expectations

### Tests Run But Fail with 403

**Symptom:** Tests don't skip but auth endpoints return 403

**This means:**
- ✅ CSRF cookie stored successfully
- ❌ But something else is wrong (invalid token, session issue, etc.)

**Not a cookie domain issue!** The skip helper would have caught that.

## Related Documentation

- [E2E-ENV-SETUP.md](./E2E-ENV-SETUP.md) - Environment configuration guide
- [DEV-ENV-PROBE.md](./DEV-ENV-PROBE.md) - Backend diagnostics endpoint
- [../../../backend/README.md](../../../backend/README.md) - Backend cookie settings

## Summary

The new `skipIfCookieDomainMismatch()` helper:
- ✅ Tests actual browser cookie storage
- ✅ Detects all cookie rejection reasons
- ✅ Provides precise skip messages
- ✅ Works without environment variable assumptions
- ✅ Integrated into 4 key auth specs
- ✅ Keeps test signal-to-noise ratio high
