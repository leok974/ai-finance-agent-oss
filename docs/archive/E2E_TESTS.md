# E2E Testing

End-to-end testing strategy for LedgerMind using Playwright.

---

## Overview

LedgerMind uses [Playwright](https://playwright.dev/) for E2E testing across:
- **Development** - Tests against local dev stack
- **Production** - Smoke tests against live app

---

## Quick Start

### 1. Install Browsers

```bash
cd apps/web
pnpm exec playwright install --with-deps chromium
```

### 2. Run Tests

```bash
# Development tests
pnpm run test:fast:dev

# Production tests (requires auth capture)
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --project=chromium-prod
```

---

## Test Projects

### chromium (Development)

- **Base URL:** `http://localhost:8083` or `http://localhost:5173`
- **Auth:** Uses dev endpoints (`/api/dev/seed-user`)
- **Tags:** `@dev`, `@chat`, `@demo`

### chromium-prod (Production)

- **Base URL:** `https://app.ledger-mind.org`
- **Auth:** Captured Google OAuth session
- **Tags:** `@prod`, `@prod-critical`, `@requires-llm`

---

## Test Tags

Use `@tag` in test names to filter:

```typescript
test('@prod-critical dashboard loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Dashboard')).toBeVisible();
});
```

**Run by tag:**
```bash
# Critical production tests only
pnpm exec playwright test --grep "@prod-critical"

# LLM-dependent tests
pnpm exec playwright test --grep "@requires-llm"

# Exclude dev-only tests
pnpm exec playwright test --grep-invert "@dev-only"
```

---

## Production Testing

### 1. Capture Auth State (One-Time)

```bash
cd apps/web
pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
```

This opens a browser for manual Google OAuth. After login, session is saved to `tests/e2e/.auth/prod-state.json`.

**Security:** Store `prod-state.json` in CI secrets, never commit to git.

### 2. Run Prod Tests

```bash
BASE_URL=https://app.ledger-mind.org \
  PW_SKIP_WS=1 \
  pnpm exec playwright test --project=chromium-prod
```

### 3. CI Integration

```yaml
# .github/workflows/e2e-prod.yml
- name: Restore prod auth state
  run: |
    echo '${{ secrets.PROD_AUTH_STATE }}' > apps/web/tests/e2e/.auth/prod-state.json

- name: Run prod E2E tests
  run: |
    cd apps/web
    BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --project=chromium-prod
```

---

## Writing E2E Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('specific behavior', async ({ page }) => {
    // Arrange
    await page.click('button:text("Open Menu")');

    // Act
    await page.fill('input[name="search"]', 'coffee');
    await page.press('input[name="search"]', 'Enter');

    // Assert
    await expect(page.locator('text=Coffee Shop')).toBeVisible();
  });
});
```

### Best Practices

1. **Use data-testid for stable selectors:**
   ```html
   <button data-testid="export-excel">Export</button>
   ```
   ```typescript
   await page.click('[data-testid="export-excel"]');
   ```

2. **Wait for network idle on navigation:**
   ```typescript
   await page.goto('/', { waitUntil: 'networkidle' });
   ```

3. **Use specific assertions:**
   ```typescript
   // Good
   await expect(locator).toBeVisible();
   await expect(locator).toHaveText('Expected');

   // Avoid
   expect(await locator.isVisible()).toBe(true);
   ```

4. **Handle streaming responses:**
   ```typescript
   // Wait for thinking bubble to disappear
   const thinking = page.locator('[data-testid="thinking-bubble"]');
   await expect(thinking).toBeVisible();
   await expect(thinking).toBeHidden();
   ```

---

## Debugging

### Interactive UI Mode

```bash
pnpm exec playwright test --ui
```

### Debug Mode

```bash
pnpm exec playwright test --debug
```

### Headed Mode

```bash
pnpm exec playwright test --headed
```

### Trace Viewer

```bash
# Run with trace
pnpm exec playwright test --trace on

# View trace
pnpm exec playwright show-trace trace.zip
```

---

## CI Execution

### Fast Lane (Every PR)

Runs `@prod-critical` tests only (~2-3 minutes):

```bash
pnpm exec playwright test --grep "@prod-critical" --workers=4
```

### Full E2E (Nightly)

Runs all E2E tests including `@requires-llm` (~10-15 minutes):

```bash
pnpm exec playwright test --workers=2
```

---

## Test Helpers

### Authentication

```typescript
// Development
import { devLogin } from './helpers/auth';
await devLogin(page, 'test@example.com', 'password');

// Production
// Uses captured state automatically via storageState in config
```

### Waiting Utilities

```typescript
// Wait for assistant reply
import { expectAssistantReplied } from './helpers/chat';
await expectAssistantReplied(page);

// Wait for chart data
await page.waitForSelector('[data-chart="top-categories"]');
await page.waitForLoadState('networkidle');
```

---

## Known Issues

### Flaky Tests

**Symptom:** Tests pass locally, fail in CI

**Solutions:**
- Increase timeout: `test.setTimeout(60000)`
- Add explicit waits: `await page.waitForTimeout(1000)` (last resort)
- Use retry: `test.describe.configure({ retries: 1 })`

### Cloudflare Challenge

**Symptom:** Production tests blocked by Cloudflare

**Solution:** Add WAF skip rule for E2E user agent:
```
http.user_agent contains "Playwright"
```

---

## Performance

### Parallel Execution

```bash
# Run with 4 workers
pnpm exec playwright test --workers=4

# Shard across CI machines
pnpm exec playwright test --shard=1/4
pnpm exec playwright test --shard=2/4
# ...
```

### Minimize Test Time

- Use `page.goto('/', { waitUntil: 'domcontentloaded' })` instead of `networkidle` when possible
- Group related tests in `describe` blocks with shared setup
- Skip slow tests in fast CI lane

---

## Troubleshooting

### "WebSocket connection failed"

**Fix:** Ensure backend is running and accessible at `BASE_URL`.

### "Timeout waiting for element"

**Fix:** Check selector is correct and element is actually rendered. Use `page.locator('selector').count()` to debug.

### "Storage state not found"

**Fix:** Run auth capture script first:
```bash
pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts
```

---

## Next Steps

- **Full testing guide:** [`TESTING_GUIDE.md`](TESTING_GUIDE.md)
- **Playwright docs:** [playwright.dev](https://playwright.dev/)
- **Dev setup:** [`../setup/DEV_SETUP.md`](../setup/DEV_SETUP.md)
