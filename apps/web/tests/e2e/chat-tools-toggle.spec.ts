import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Tools Toggle', () => {
  test('tools toggle button persists when hiding/showing tools', async ({ page }) => {
    // Use minimal-UI URL to avoid overlay interference
    await page.goto(`${BASE}/?chat=1&prefetch=0&panel=0`);
    
    // Chat should auto-open with ?chat=1, wait for iframe
    const frame = page.frameLocator('#lm-chat-iframe');
    await frame.locator('body').waitFor({ state: 'visible', timeout: 10000 });

    // Tools toggle should be visible
    const toggle = frame.getByTestId('chat-tools-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Hide tools');

    // Hide tools - button should still be visible
    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Show tools');

    // Show tools again
    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Hide tools');
  });
});
