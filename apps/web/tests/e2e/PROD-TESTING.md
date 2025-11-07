# Production E2E Testing Guide

This guide explains how to run Playwright e2e tests against the production environment (`https://app.ledger-mind.org`).

## Overview

Production testing uses a **one-time manual OAuth capture** to authenticate, then reuses that session for automated tests. This approach:
- ✅ Avoids automating Google OAuth (reduces flakiness)
- ✅ Provides durable session cookies/tokens
- ✅ Keeps production credentials out of code
- ✅ Enables CI/CD integration with proper secrets management

## Setup: One-Time Authentication Capture

### Step 1: Capture Production Login State

Run the interactive capture script to manually complete Google OAuth:

```powershell
cd apps/web
$env:BASE_URL = "https://app.ledger-mind.org"
pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
```

**What happens:**
1. A Chrome browser window opens showing the production app
2. If not logged in, click "Sign in with Google" and complete OAuth
3. Once the dashboard loads, **press ENTER in the terminal**
4. Session state is saved to `tests/e2e/.auth/prod-state.json`

### Step 2: Verify State Capture

Check that the state file was created:

```powershell
Test-Path apps/web/tests/e2e/.auth/prod-state.json
# Should return: True
```

**⚠️ IMPORTANT**: Keep `prod-state.json` out of git! It contains session cookies/tokens.

## Running Production Tests

### Option 1: Run All Production-Safe Tests

```powershell
cd apps/web
$env:BASE_URL = "https://app.ledger-mind.org"
$env:PW_SKIP_WS = "1"  # Don't start local dev servers
pnpm exec playwright test --project=chromium-prod --reporter=line
```

### Option 2: Run Specific Test Suite

```powershell
# Smoke tests only (read-only, no mutations)
pnpm exec playwright test tests/e2e/prod-smoke.spec.ts --project=chromium-prod

# Upload tests (mutates test user data only)
pnpm exec playwright test tests/e2e/prod-upload.spec.ts --project=chromium-prod
```

### Option 3: Watch Mode (Development)

```powershell
pnpm exec playwright test --project=chromium-prod --ui
```

## Test Categories

### `@prod-safe` Tests
Tests tagged with `@prod-safe` are safe to run against production:
- **Read-only tests**: Dashboard loads, auth state checks, header visibility
- **User-scoped mutations**: CSV uploads that only affect the test user's data
- **Validation tests**: Format checks, error handling

### `@dev-only` Tests (Automatically Skipped)
Tests marked `@dev-only` require dev routes and are automatically skipped in the `chromium-prod` project:
- User seeding via `/api/dev/seed-user`
- Dev endpoint testing
- Database reset operations

## Writing New Production Tests

### Read-Only Test Example

```typescript
import { test, expect } from "@playwright/test";
import { assertLoggedIn } from "./utils/prodSession";

test.describe("@prod-safe", () => {
  // Verify session before each test
  test.beforeEach(async ({ page }) => {
    await assertLoggedIn(page);
  });

  test("verifies cache headers", async ({ page, baseURL }) => {
    await page.goto("/");
    const resp = await page.request.get(new URL("/api/auth/me", baseURL!).toString());
    expect(resp.headers()["cache-control"]).toContain("no-store");
  });
});
```

### Mutation Test Example (User-Scoped)

```typescript
import { test, expect } from "@playwright/test";
import { assertLoggedIn } from "./utils/prodSession";

test.describe("@prod-safe", () => {
  test.beforeEach(async ({ page }) => {
    await assertLoggedIn(page);
  });

  test("uploads CSV successfully", async ({ page }) => {
    await page.goto("/");
    const upload = page.locator('input[type="file"]');
    await upload.setInputFiles("tests/e2e/fixtures/mini.csv");

    // Use robust selectors with .first() to avoid strict mode violations
    const successIndicator = page.getByText(/Total Spend/i)
      .or(page.locator('[class*="chart"]'))
      .first();
    await expect(successIndicator).toBeVisible();
  });
});
```

### Best Practices

1. **Use assertLoggedIn()** - Add to beforeEach to catch expired sessions early
2. **Prefer ARIA roles** - Use `getByRole("status")`, `getByRole("alert")` for toasts
3. **Generic text patterns** - Match `/invalid|error|failed/i` instead of exact copy
4. **Avoid strict mode** - Use `.first()` on or() chains with multiple possible matches
5. **Flexible selectors** - Combine multiple strategies with `.or()` for UI drift tolerance

## Session Expiration

If tests start failing with authentication errors:

1. **Re-capture the state** (session may have expired):
   ```powershell
   pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
   ```

2. **Verify login in browser**: Open `https://app.ledger-mind.org` and check if you're still logged in

3. **Check cookie expiration**: Google OAuth sessions typically last 1-2 weeks

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests (Production)

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8am UTC
  workflow_dispatch:

jobs:
  e2e-prod:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Restore production state
        run: |
          mkdir -p apps/web/tests/e2e/.auth
          echo "${{ secrets.PROD_STATE_JSON }}" > apps/web/tests/e2e/.auth/prod-state.json

      - name: Run production tests
        run: |
          cd apps/web
          BASE_URL=https://app.ledger-mind.org \
          PW_SKIP_WS=1 \
          pnpm exec playwright test --project=chromium-prod --reporter=line

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

### Storing Production State in GitHub Secrets

1. Capture state locally:
   ```powershell
   pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
   ```

2. Copy file contents:
   ```powershell
   Get-Content apps/web/tests/e2e/.auth/prod-state.json | Set-Clipboard
   ```

3. Add to GitHub repository:
   - Navigate to: **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `PROD_STATE_JSON`
   - Value: Paste clipboard contents
   - Click **Add secret**

## Troubleshooting

### "Storage state not found" Error

**Problem**: `tests/e2e/.auth/prod-state.json` doesn't exist

**Solution**: Run the capture script first:
```powershell
pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
```

### Authentication Fails During Tests

**Problem**: Session expired or invalid cookies

**Solutions**:
1. Re-capture state (most common fix)
2. Check if you're logged out in a real browser
3. Clear persistent context and re-authenticate:
   ```powershell
   Remove-Item -Recurse -Force apps/web/tests/e2e/.auth/.user-data-prod
   pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
   ```

### Tests Hang on Google OAuth

**Problem**: Script tries to automate Google login

**Solution**: The capture script is **intentionally manual**. Complete OAuth in the opened browser, then press ENTER.

### Cookie Domain Mismatch

**Problem**: Cookies from production (`Domain=.ledger-mind.org`) don't work locally

**Solution**: This is expected! Use the `chromium-prod` project which sets `baseURL` to production:
```powershell
# ✅ Correct
pnpm exec playwright test --project=chromium-prod

# ❌ Wrong (tries to use prod cookies on localhost)
BASE_URL=http://localhost:5173 pnpm exec playwright test --project=chromium-prod
```

## Security Best Practices

1. **Never commit** `prod-state.json` to git
2. **Rotate credentials** periodically by re-capturing state
3. **Use dedicated test account** with minimal privileges
4. **Monitor test activity** in production logs
5. **Rate limit** test runs to avoid overloading production
6. **Tag dangerous tests** with `@dev-only` to prevent accidental runs

## Test Account Guidelines

Your production test account should:
- ✅ Use a dedicated email (e.g., `test+prod@yourdomain.com`)
- ✅ Have minimal data (makes tests predictable)
- ✅ Be monitored separately from real users
- ✅ Have no access to PII or sensitive data
- ❌ Not be a shared account with real user activity

## File Structure

```
apps/web/tests/e2e/
├── .auth/
│   ├── capture-prod-state.ts    # Interactive OAuth capture script
│   ├── prod-state.json           # Captured session (gitignored)
│   ├── .user-data-prod/          # Persistent browser profile (gitignored)
│   ├── .gitignore                # Protects sensitive files
│   └── auth.setup.ts             # Dev/local auth setup (unchanged)
├── fixtures/
│   └── mini.csv                  # Sample CSV for upload tests
├── prod-smoke.spec.ts            # Read-only production smoke tests
├── prod-upload.spec.ts           # User-scoped mutation tests
└── ...                           # Other dev/local tests
```

## Related Documentation

- [Playwright Configuration](../../playwright.config.ts) - See `chromium-prod` project setup
- [Cookie Domain Testing](./COOKIE-DOMAIN-SKIP.md) - Domain mismatch handling
- [E2E Environment Setup](./E2E-ENV-SETUP.md) - Local dev testing
- [Main Testing Guide](../../../TESTING_GUIDE.md) - All testing approaches

## Support

Questions? Issues?
1. Check this README first
2. Review Playwright docs: https://playwright.dev
3. Check test output artifacts (screenshots, videos, traces)
4. File issue with reproduction steps
