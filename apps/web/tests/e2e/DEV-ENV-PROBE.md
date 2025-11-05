# Dev Environment Probe for E2E Tests

## Overview
Added diagnostic capabilities to E2E tests to help debug environment issues and test failures.

## Backend Endpoint: `/api/dev/env`
**Location:** `apps/backend/app/routers/dev.py`

Returns environment configuration used by the backend:
```json
{
  "app_env": "prod",
  "allow_dev_routes": true,
  "allow_registration": false,
  "cookie": {
    "domain": ".ledger-mind.org",
    "samesite": "lax",
    "secure": true
  },
  "csrf_required": true
}
```

### Security
- Protected by `_dev_guard()` - returns 404 unless `ALLOW_DEV_ROUTES=1`
- Router only included in app when `ALLOW_DEV_ROUTES=1`
- Double protection: router-level + endpoint-level guards

### Manual Testing
```bash
curl http://127.0.0.1/api/dev/env
```

## Playwright Helper: `logDevEnv()`
**Location:** `apps/web/tests/e2e/utils/dev-env.ts`

### Usage in Tests
```typescript
import { logDevEnv } from '../utils/dev-env';

test('my test', async ({ page }) => {
  await logDevEnv(page, 'my-test');
  // ... rest of test
});
```

### Output
1. **Console:** Logs to stdout for CI visibility
   ```
   [dev-env] csrf-contract {
     app_env: 'prod',
     allow_dev_routes: true,
     ...
   }
   ```

2. **Test Annotations:** Attaches to test.info() for Playwright reports
   - Shows in trace viewer
   - Included in HTML reports
   - Useful for debugging test failures

### Error Handling
- Gracefully handles 404 if dev routes disabled
- Catches and logs errors without failing tests
- Provides clear diagnostic messages

## Integration Status
All auth test specs now include `logDevEnv()` call:
- ✅ `remember-me.spec.ts`
- ✅ `change-password.spec.ts`
- ✅ `csrf-contract.spec.ts`
- ✅ `cookie-attrs.spec.ts`
- ✅ `reset-password.spec.ts`
- ✅ `register-login.spec.ts`

## Benefits
1. **Debugging:** Instantly see backend configuration in test output
2. **CI Visibility:** Environment details logged to console for CI pipelines
3. **Test Skipping:** Helps understand why tests skip (cookie domain, registration disabled, etc.)
4. **Troubleshooting:** Shows exact backend state during test execution

## Example Output
```
Running 7 tests using 6 workers
[chromium] › tests\e2e\auth\csrf-contract.spec.ts:10:3 › Auth CSRF contract
[dev-env] csrf-contract {
  app_env: 'prod',
  allow_dev_routes: true,
  allow_registration: false,
  cookie: { domain: '.ledger-mind.org', samesite: 'lax', secure: true },
  csrf_required: true
}
  2 skipped
```

This clearly explains why the test skipped: cookie domain `.ledger-mind.org` doesn't match `BASE_URL=http://127.0.0.1`.

## When to Use
- Debugging test failures
- Understanding test skips
- Verifying backend configuration in CI
- Troubleshooting environment-specific issues
- CI pipeline debugging

## When NOT to Use
- Production environments (endpoint won't be available)
- Performance-critical test paths (adds small HTTP call overhead)
- Tests that don't interact with backend

## Future Enhancements
Could extend with additional diagnostics:
- Database connection status
- KMS availability
- Token encryption status
- Active sessions count
- Current time/timezone
