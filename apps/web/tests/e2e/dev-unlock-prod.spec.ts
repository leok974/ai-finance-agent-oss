/**
 * E2E Test: Production Guard for Dev Unlock
 *
 * Ensures dev tools are completely hidden/disabled in production environment.
 * This test should run in a separate CI job with APP_ENV=prod.
 *
 * @prod-guard tag indicates this test validates production security.
 */
import { test, expect } from '@playwright/test';

test.describe('@prod-guard Production Environment', () => {
  test.beforeEach(async () => {
    // Verify we're running in prod mode
    // (This should be set via environment variables in CI)
    const appEnv = process.env.APP_ENV || process.env.ENV;
    if (appEnv !== 'prod' && appEnv !== 'production') {
      test.skip(true, 'This test suite only runs in production mode (APP_ENV=prod)');
    }
  });

  test('Dev unlock button should not appear in account menu', async ({ page }) => {
    // Login (assuming prod has auth setup)
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Open account menu
    const accountButton = page.locator('button:has-text("Account")');
    if (await accountButton.isVisible({ timeout: 5000 })) {
      await accountButton.click();
      await page.waitForTimeout(500);

      // Verify "Unlock Dev Tools" button does NOT exist
      const unlockButton = page.locator('[data-testid="unlock-dev"]');
      await expect(unlockButton).toHaveCount(0);

      // Also verify by text content
      const unlockText = page.locator('text=/Unlock Dev Tools/i');
      await expect(unlockText).toHaveCount(0);
    }
  });

  test('RAG chips should never be visible in prod', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // RAG chips should not exist at all in production
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toHaveCount(0);

    // Wait a bit to ensure no lazy loading
    await page.waitForTimeout(2000);
    await expect(ragChips).toHaveCount(0);
  });

  test('Direct navigation to dev tools should fail', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to manually trigger dev tools via console (if exposed)
    const result = await page.evaluate(() => {
      // Check if dev tools hooks exist in window
      const win = window as unknown as Record<string, unknown>;
      return {
        hasDevTools: typeof win.__DEV_TOOLS__ !== 'undefined',
        hasRagTools: typeof win.__RAG_TOOLS__ !== 'undefined',
      };
    });

    expect(result.hasDevTools).toBe(false);
    expect(result.hasRagTools).toBe(false);
  });

  test('Backend dev unlock endpoint should return 403', async ({ page }) => {
    // Attempt to call the unlock endpoint directly
    const response = await page.request.post('/auth/dev/unlock', {
      data: { pin: '123456' },
      failOnStatusCode: false,
    });

    // Should be forbidden in production
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.detail.toLowerCase()).toMatch(/production|prod|not available/);
  });

  test('Backend RAG seed endpoint should return 403', async ({ page }) => {
    const response = await page.request.post('/agent/tools/rag/seed', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.detail.toLowerCase()).toMatch(/dev|production/);
  });

  test('Backend RAG reset endpoint should return 403', async ({ page }) => {
    const response = await page.request.post('/agent/tools/rag/reset', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
  });

  test('Dev unlock cookie should be ignored in prod', async ({ page }) => {
    await page.goto('/');

    // Manually set dev_unlocked cookie (simulating bypass attempt)
    await page.context().addCookies([
      {
        name: 'dev_unlocked',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // RAG chips should still not be visible
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toHaveCount(0);

    // Try to call RAG endpoint with cookie
    const response = await page.request.post('/agent/tools/rag/seed', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
  });

  test('URL manipulation should not expose dev tools', async ({ page }) => {
    // Try various URL patterns that might expose dev tools
    const devUrls = [
      '/dev',
      '/dev-tools',
      '/admin/dev',
      '/?dev=1',
      '/?unlock=true',
      '/#dev',
    ];

    for (const url of devUrls) {
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {
        // 404 is acceptable
      });

      // Verify RAG chips never appear
      const ragChips = page.locator('[data-testid="rag-chips"]');
      await expect(ragChips).toHaveCount(0);
    }
  });

  test('Console commands should not enable dev mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to enable dev mode via console injection
    await page.evaluate(() => {
      // Common dev mode triggers
      const win = window as unknown as Record<string, unknown>;
      win.enableDevMode = true;
      win.__DEV__ = true;
      localStorage.setItem('dev_unlocked', 'true');
      sessionStorage.setItem('dev_unlocked', 'true');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // RAG chips should still not appear
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toHaveCount(0);
  });

  test('Network tab should not expose dev endpoints', async ({ page }) => {
    const devEndpoints: string[] = [];

    // Monitor network requests
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/dev') || url.includes('/rag')) {
        devEndpoints.push(url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate around the app
    await page.waitForTimeout(2000);

    // In production, no dev endpoints should be called
    // (except maybe 403 responses if user tries to access them)
    expect(devEndpoints.length).toBe(0);
  });
});

// Utility test to verify prod mode is actually set
test('@prod-guard Verify production environment', async () => {
  const appEnv = process.env.APP_ENV || process.env.ENV || 'dev';

  // If not in prod, skip all tests with clear message
  if (appEnv !== 'prod' && appEnv !== 'production') {
    test.skip(true, 'Production guard tests require APP_ENV=prod');
  }

  expect(['prod', 'production']).toContain(appEnv);
});

test('@prod-guard No dev_unlocked cookie ever set', async ({ page }) => {
  await page.goto('/');
  // Try to call unlock form without CSRF (should 403 server-side)
  const status = await page.evaluate(async () => {
    const fd = new FormData();
    fd.append('pin', '946281');
    const res = await fetch('/auth/dev/unlock', {
      method: 'POST',
      body: fd,
      credentials: 'include'
    });
    return { status: res.status, cookies: document.cookie };
  });
  expect([400, 403]).toContain(status.status);
  expect(status.cookies).not.toContain('dev_unlocked=');
});
