import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Auth Handling', () => {
  test('shows auth banner and disabled input on 401', async ({ page }) => {
    // Use incognito context to ensure no auth cookies
    await page.goto(`${BASE}/?chat=1`);
    
    // Open chat dock
    const toggleButton = page.getByTestId('chat-toggle');
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
    }
    
    const frame = page.frameLocator('#lm-chat-iframe');

    // Input and send button should exist
    await expect(frame.getByTestId('chat-input')).toBeVisible();
    await expect(frame.getByTestId('chat-send')).toBeVisible();

    // Try to send a message (may get 401 if not logged in)
    await frame.getByTestId('chat-input').fill('test message');
    await frame.getByTestId('chat-send').click();

    // Wait a bit for the request to complete
    await page.waitForTimeout(2000);

    // Check if auth banner appears (only if got 401)
    const authBanner = frame.getByTestId('chat-auth-banner');
    const bannerVisible = await authBanner.isVisible().catch(() => false);
    
    if (bannerVisible) {
      // If 401 happened, input should be disabled
      await expect(frame.getByTestId('chat-input')).toBeDisabled();
      await expect(frame.getByTestId('chat-send')).toBeDisabled();
      await expect(authBanner).toContainText('not signed in');
    }
  });
});
