import { test, expect } from '@playwright/test';

test.describe('@debug Cookie verification', () => {
  test('cookies are sent with requests', async ({ page, context }) => {
    // Navigate to home
    await page.goto('/');

    // Check cookies in context
    const cookies = await context.cookies();
    console.log(`[TEST] Browser context has ${cookies.length} cookies:`);
    for (const c of cookies) {
      console.log(`  - ${c.name}: domain=${c.domain}, path=${c.path}, secure=${c.secure}`);
    }

    // Try to access /api/auth/me
    const response = await page.request.get('/api/auth/me');
    console.log(`[TEST] GET /api/auth/me → ${response.status()} ${response.statusText()}`);

    if (response.ok()) {
      const data = await response.json();
      console.log(`[TEST] User data:`, data);
    } else {
      const text = await response.text();
      console.log(`[TEST] Error response:`, text);
    }

    // Also check cookies via document.cookie
    const docCookies = await page.evaluate(() => document.cookie);
    console.log(`[TEST] document.cookie:`, docCookies);
  });
});
