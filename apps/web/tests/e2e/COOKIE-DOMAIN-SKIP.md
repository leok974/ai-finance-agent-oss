# Cookie Domain Mismatch Protection - Implementation Summary

## What Changed

Added graceful skip logic to auth tests to handle cookie domain mismatches between `BASE_URL` and `COOKIE_DOMAIN`.

## Files Modified

### 1. `change-password.spec.ts`
**Added:** Cookie domain validation before attempting authentication
```typescript
const host = new URL(process.env.BASE_URL ?? 'http://127.0.0.1').hostname.toLowerCase();
const cookieDomain = (process.env.COOKIE_DOMAIN ?? '').toLowerCase();
if (cookieDomain && host !== cookieDomain && !host.endsWith(cookieDomain.replace(/^\./,''))) {
  test.skip(true, `cookie Domain=${cookieDomain} doesn't match BASE_URL host=${host}`);
}
```

### 2. `remember-me.spec.ts`
**Added:** Same cookie domain validation logic

### Already Protected
- ✅ `csrf-contract.spec.ts` - Already had skip logic
- ✅ `cookie-attrs.spec.ts` - Already had skip logic
- ✅ `register-login.spec.ts` - Attempts seed, skips if cookies fail
- ✅ `reset-password.spec.ts` - Has its own skip conditions

## Behavior

### Before This Change
```
❌ Test runs → CSRF cookie rejected by browser → 403 Forbidden → Confusing error
```

### After This Change
```
✅ Test checks domain → Mismatch detected → Graceful skip with clear message
```

## Test Output

### Cookie Domain Mismatch (Expected)
```
[dev-env] change-password {
  app_env: 'prod',
  allow_dev_routes: true,
  allow_registration: false,
  cookie: { domain: '.ledger-mind.org', samesite: 'lax', secure: true },
  csrf_required: true
}
  7 skipped
```

**Skip Reason:** `cookie Domain=.ledger-mind.org doesn't match BASE_URL host=127.0.0.1 — CSRF/session cookies won't store`

### Cookie Domain Matches (Tests Run)
```bash
# Local configuration
COOKIE_DOMAIN=127.0.0.1
BASE_URL=http://127.0.0.1

# OR Staging configuration
COOKIE_DOMAIN=.ledger-mind.org
BASE_URL=https://app.ledger-mind.org
```

Both configurations work - tests run normally when domains match.

## Why This Matters

### Browser Security Model
Browsers enforce strict cookie domain rules:
- Cookie `Domain=.ledger-mind.org` → Only stored for `*.ledger-mind.org` hosts
- Cookie `Domain=127.0.0.1` → Only stored for `127.0.0.1` host
- Mismatch → Cookie rejected → No CSRF token → 403 Forbidden

### Without Skip Logic
1. Test tries to get CSRF token
2. Browser rejects cookie (domain mismatch)
3. Test tries to login
4. Backend checks for CSRF token
5. Token missing → 403 Forbidden
6. **Confusing error:** "Why did login fail? Is auth broken?"

### With Skip Logic
1. Test checks domain compatibility
2. Mismatch detected → Skip with clear reason
3. **Clear message:** "Domain mismatch - this is expected, not a bug"

## Use Cases

### ✅ Skip is Expected (Good)
- Running tests locally (`BASE_URL=http://127.0.0.1`) against prod-configured backend (`COOKIE_DOMAIN=.ledger-mind.org`)
- CI testing with mismatched configuration
- Quick smoke tests without reconfiguring backend

### ✅ Tests Run (Also Good)
- Local dev: Both set to `127.0.0.1`
- Staging: Both set to `.ledger-mind.org` / `app.ledger-mind.org`
- Properly configured environments

### ❌ Skip is Unexpected (Investigate)
- You configured matching domains but tests still skip
- Check for typos: `.ledger-mind.org` vs `ledger-mind.org` (missing dot)
- Check for case sensitivity: domain matching is case-insensitive now

## Domain Matching Logic

The validation is smart enough to handle:

```typescript
// Exact match
host === cookieDomain
// "127.0.0.1" === "127.0.0.1" ✅

// Subdomain match (with leading dot)
host.endsWith(cookieDomain.replace(/^\./,''))
// "app.ledger-mind.org".endsWith("ledger-mind.org") ✅ (.ledger-mind.org)
// "www.ledger-mind.org".endsWith("ledger-mind.org") ✅ (.ledger-mind.org)
// "staging.ledger-mind.org".endsWith("ledger-mind.org") ✅ (.ledger-mind.org)

// No match
// "127.0.0.1".endsWith("ledger-mind.org") ❌
// "example.com".endsWith("ledger-mind.org") ❌
```

## Configuration Matrix

| BASE_URL | COOKIE_DOMAIN | Result |
|----------|---------------|--------|
| `http://127.0.0.1` | `127.0.0.1` | ✅ Tests run |
| `http://127.0.0.1` | `.ledger-mind.org` | ⏭️ Tests skip |
| `https://app.ledger-mind.org` | `.ledger-mind.org` | ✅ Tests run |
| `https://app.ledger-mind.org` | `127.0.0.1` | ⏭️ Tests skip |
| `https://staging.ledger-mind.org` | `.ledger-mind.org` | ✅ Tests run |
| `http://localhost` | `localhost` | ✅ Tests run |

## Environment Setup Tips

### For Local Development
```bash
# Backend: docker-compose.dev.yml or .env
COOKIE_DOMAIN=127.0.0.1
COOKIE_SECURE=0

# Tests
BASE_URL=http://127.0.0.1 pnpm exec playwright test
```

### For Staging Tests
```bash
# Backend: docker-compose.staging.yml
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1

# Tests
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test
```

### For CI/CD
```yaml
# .github/workflows/e2e.yml
env:
  BASE_URL: http://127.0.0.1

services:
  backend:
    environment:
      COOKIE_DOMAIN: 127.0.0.1
      COOKIE_SECURE: 0
```

## Testing the Skip Logic

```bash
# Force skip by mismatching domains
cd apps/web
$env:BASE_URL="http://127.0.0.1"
$env:COOKIE_DOMAIN=".ledger-mind.org"
pnpm exec playwright test tests/e2e/auth/ --reporter=line

# Expected: All tests skip with clear domain mismatch message
# Output: "7 skipped"
```

## Related Documentation

- [E2E-ENV-SETUP.md](./E2E-ENV-SETUP.md) - Complete environment setup guide
- [DEV-ENV-PROBE.md](./DEV-ENV-PROBE.md) - Environment diagnostics
- [../../backend/README.md](../../backend/README.md) - Backend cookie configuration

## Next Steps

If you want similar protection in other test suites:
1. Copy the domain validation snippet
2. Add after `logDevEnv()` call
3. Adjust skip message as needed

The pattern is reusable for any test that requires cookie authentication!
