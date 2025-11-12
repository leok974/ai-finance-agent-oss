# Production E2E Testing Guide

## Overview

Production smoke tests verify critical endpoints behave correctly on live production without needing database seeding or dev routes.

## Setup (One-Time)

### 1. Create Test Google Account

Create a dedicated Google account for testing (no PII, read-only where possible).

### 2. Capture Production Auth State

```powershell
cd apps/web

# Set production URL
$env:BASE_URL = "https://app.ledger-mind.org"

# Skip starting dev servers
$env:PW_SKIP_WS = "1"

# Run auth setup manually to capture state
pnpm exec playwright test auth.setup --project=setup

# Copy captured state to prod-state.json
Copy-Item tests/e2e/.auth/state.json tests/e2e/.auth/prod-state.json
```

Alternatively, use CDP helper (if configured):
```powershell
# Use your existing CDP auth capture script
.\scripts\capture-prod-auth.ps1
```

### 3. Verify State File Exists

Ensure `apps/web/tests/e2e/.auth/prod-state.json` exists with valid cookies/tokens.

## Running Production Tests

### Basic Run

```powershell
cd apps/web

# Set production URL
$env:BASE_URL = "https://app.ledger-mind.org"

# Skip dev server startup
$env:PW_SKIP_WS = "1"

# Run prod-tagged tests only
pnpm exec playwright test --project=chromium-prod
```

### Specific Test File

```powershell
pnpm exec playwright test prod-tools-health.spec.ts --project=chromium-prod
```

### Debug Mode

```powershell
pnpm exec playwright test --project=chromium-prod --headed --debug
```

## Test Tags

Production tests MUST be tagged with `@prod` in the test name:

```typescript
test('my prod test @prod', async ({ request }) => {
  // Test code
});
```

## Test Guidelines

### ✅ DO

- Test public/auth-gated endpoints (200/401 acceptable)
- Verify endpoints don't 500 on empty/edge cases
- Use realistic but minimal payloads
- Check response structure validity
- Test critical boot-time endpoints

### ❌ DON'T

- Mutate production data (POST/PUT/DELETE with side effects)
- Depend on dev routes (`/api/dev/*`)
- Require database seeding
- Make destructive API calls
- Test features requiring specific user data

## Troubleshooting

### "storageState: ENOENT prod-state.json"

Run setup steps above to capture auth state.

### "401 Unauthorized" on all tests

Auth session expired. Recapture state:

```powershell
# Re-login and capture fresh state
$env:BASE_URL = "https://app.ledger-mind.org"
pnpm exec playwright test auth.setup --project=setup
Copy-Item tests/e2e/.auth/state.json tests/e2e/.auth/prod-state.json
```

### Tests fail locally but pass in CI

- Check `BASE_URL` environment variable
- Verify `PW_SKIP_WS=1` is set (don't start local dev servers)
- Ensure prod-state.json has valid session

## Playwright Config Reference

```typescript
// playwright.config.ts
{
  name: 'chromium-prod',
  use: {
    baseURL: process.env.BASE_URL || 'https://app.ledger-mind.org',
    storageState: './tests/e2e/.auth/prod-state.json',
    headless: true,
  },
  dependencies: [],        // No auth setup dependency
  testIgnore: /@dev-only|@needs-seed/,
  grep: /@prod/,          // Only run @prod tagged tests
}
```

## Current Production Tests

### `prod-tools-health.spec.ts`

Verifies boot-critical tool endpoints never 500:
- `/agent/tools/insights/expanded` - Returns safe empty fallback on errors
- `/agent/tools/analytics/forecast/cashflow` - Returns safe empty fallback on errors

Expected behavior:
- ✅ 200 with valid/empty data structure
- ✅ 401 if auth required
- ❌ Never 500 (internal server error)

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Production Smoke Tests
  run: |
    cd apps/web
    pnpm exec playwright test --project=chromium-prod
  env:
    BASE_URL: https://app.ledger-mind.org
    PW_SKIP_WS: "1"
```

**Note:** Store `prod-state.json` as GitHub Secret or regenerate on each CI run using service account.
