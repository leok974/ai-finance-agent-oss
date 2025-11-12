import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Tools Toggle', () => {
  test('tools toggle button persists when hiding/showing tools', async ({ page }) => {
    await page.goto(`${BASE}/?chat=1`);
    
    // Open chat dock
    await page.getByTestId('chat-toggle').click();
    const frame = page.frameLocator('#lm-chat-iframe');

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
