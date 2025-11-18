# Production E2E Testing Strategy

## Overview

The production E2E lane runs automated tests against the live production environment at `https://app.ledger-mind.org`. This ensures critical user flows work correctly in the real environment.

## Architecture

### 1. Global Setup (`tests/e2e/global-setup.ts`)

- **Purpose:** Mint an authenticated session before tests run
- **Detection:** Auto-detects prod environment when `BASE_URL` contains `ledger-mind.org`
- **Authentication:** Uses HMAC-SHA256 signed requests to `/api/e2e/session`
- **Output:** Saves session cookies to `tests/e2e/.auth/prod-state.json`

**Key Features:**

- Skips session minting for non-prod URLs (local development)
- Throws clear errors if required credentials are missing
- Validates session response before proceeding

### 2. Playwright Config (`playwright.config.ts`)

- **Project:** `chromium-prod`
- **Trigger:** Automatically activated when `BASE_URL` matches `ledger-mind.org`
- **Test Filter:** Only runs tests tagged with `@prod`
- **No Local Servers:** Connects directly to live production

**Configuration:**

```typescript
{
  name: 'chromium-prod',
  use: {
    baseURL: 'https://app.ledger-mind.org',
    storageState: PROD_STATE,  // Session cookies from global-setup
    headless: true,
    retries: 1,  // Retry once for flaky tests
  },
  grep: /@prod/,  // Only run @prod tagged tests
}
```

### 3. Test Structure

Tests must:

1. Be tagged with `@prod` in the test suite name
2. Use `page.request` (not `request` fixture) for API calls to preserve authentication
3. Test critical user flows that must work in production

**Example:**

```typescript
test.describe("@prod CSV ingest", () => {
  test("upload CSV populates dashboard", async ({ page }) => {
    // page.request preserves storage state cookies
    const resp = await page.request.post(`/api/ingest?replace=true`, {
      multipart: {
        file: {
          name: "transactions.csv",
          buffer: Buffer.from(csvContent),
        },
      },
    });
    expect(resp.ok()).toBeTruthy();
  });
});
```

## Running Prod E2E Tests

### Prerequisites

1. **Environment Variables** (required):

   ```bash
   export BASE_URL=https://app.ledger-mind.org
   export E2E_SESSION_HMAC_SECRET=<your-secret>  # Must match backend config
   export E2E_USER=leoklemet.pa@gmail.com        # Test account email
   ```

2. **Backend Configuration:**
   - Production backend must have matching `E2E_SESSION_HMAC_SECRET`
   - `/api/e2e/session` endpoint must be accessible
   - Test user account must exist in production database

### Execution

```bash
cd apps/web

# Set environment variables (see above)

# Run all prod tests
pnpm playwright test --project=chromium-prod

# Run specific test file
pnpm playwright test csv-ingest-populates-dashboard.spec.ts --project=chromium-prod

# Run with UI (for debugging)
pnpm playwright test --project=chromium-prod --ui
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Run Prod E2E Tests
  env:
    BASE_URL: https://app.ledger-mind.org
    E2E_SESSION_HMAC_SECRET: ${{ secrets.E2E_SESSION_HMAC_SECRET }}
    E2E_USER: ${{ secrets.E2E_USER }}
  run: |
    cd apps/web
    pnpm playwright test --project=chromium-prod
```

## Troubleshooting

### "E2E_SESSION_HMAC_SECRET must be set"

- Ensure environment variable is exported
- Verify it matches the backend configuration
- Check `.env` file has the correct value

### "Failed to create prod E2E session: 401"

- HMAC signature mismatch - check `E2E_SESSION_HMAC_SECRET` matches backend
- Verify `E2E_USER` account exists in production
- Check backend logs for `/api/e2e/session` errors

### "Non-prod BASE_URL detected - skipping session mint"

- `BASE_URL` must contain `ledger-mind.org`
- For local testing, use a different approach (not covered here)

### Tests get 401 errors

- Storage state cookies not being sent
- Use `page.request` instead of `request` fixture
- Check `tests/e2e/.auth/prod-state.json` contains valid cookies

## Important Specs

### Chat Panel Scroll Test

**File:** `tests/e2e/chat-panel-scroll-open.spec.ts`

**Purpose:** Ensure page scroll still works when chat is open and backdrop is present.

**Tags:** `@prod`, `@chat`

**High-Level Steps:**

1. Navigate to `/`
2. Inject a tall filler element (`<div style="height: 2000px">`) to make the page scrollable
3. Open chat via `data-testid="lm-chat-launcher-button"`
4. Assert `lm-chat-shell` is visible
5. Call `window.scrollTo(0, 800)` to scroll down
6. Assert `window.scrollY >= 800` even with chat + backdrop open

**Why This Matters:**

This test guards against regressions where the backdrop blocks scrolling. It validates that the JavaScript-based scroll forwarding (`handleBackdropWheel` + `handleBackdropTouchMove`) is working correctly.

**Known Issues & Scroll Behavior:**

- **Older versions** relied on `pointer-events: none` overlay to allow scroll passthrough
  - Problem: Required careful z-index management and had edge cases with clickable elements
  - Solution worked but was fragile

- **Current implementation** uses a full-screen backdrop with explicit wheel/touchmove forwarding
  - The backdrop intercepts all events (needed for click-to-close and visual dimming)
  - JavaScript handlers forward scroll events to `window.scrollBy()`
  - More explicit and reliable than pointer-events tricks

**This E2E spec guards against regressions where backdrop blocks scrolling.**

See `CHATDOCK_V2_FRONTEND.md` for detailed documentation on the backdrop scroll handling implementation.

## Test Coverage

Current prod E2E tests:

- ✅ CSV ingest (realistic data, empty file, malformed data)
- ✅ Chat panel scroll (backdrop scroll forwarding)
- ✅ (Add more as implemented)

## Best Practices

1. **Tag all prod tests:** Use `@prod` in test suite name
2. **Use page.request:** Always use `page.request` for authenticated API calls
3. **Test happy paths:** Focus on critical user flows
4. **Include error cases:** Test graceful error handling
5. **Keep tests independent:** Each test should work in isolation
6. **Avoid test data pollution:** Use `replace=true` or unique identifiers

## Security Notes

- **HMAC Secret:** Never commit `E2E_SESSION_HMAC_SECRET` to source control
- **Storage State:** `.auth/prod-state.json` contains sensitive session cookies
- **Gitignore:** Ensure `tests/e2e/.auth/` is in `.gitignore`
- **Rotation:** Rotate `E2E_SESSION_HMAC_SECRET` periodically

## Local Development

**Important:** Prod E2E tests are designed exclusively for production testing.

For local development and testing:

- Use unit tests (Vitest)
- Use component tests
- Use integration tests against local backend
- **Do not** try to run `chromium-prod` project locally

The global-setup will automatically skip session minting when `BASE_URL` doesn't contain `ledger-mind.org`.
