import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Auth Handling', () => {
  test('shows auth banner and disabled input on 401', async ({ page, context }) => {
    // Start from a clean unauthenticated state
    await context.clearCookies();

    // Use minimal-UI URL to avoid overlay interference
    await page.goto(`${BASE}/?chat=1&prefetch=0&panel=0`);
    
    // Chat should auto-open with ?chat=1, wait for iframe
    const frame = page.frameLocator('#lm-chat-iframe');
    await frame.locator('body').waitFor({ state: 'visible', timeout: 10000 });

    // Input and send button should exist
    await expect(frame.getByTestId('chat-input')).toBeVisible();
    await expect(frame.getByTestId('chat-send')).toBeVisible();

    // Try to send a message - should get 401 when unauthenticated
    await frame.getByTestId('chat-input').fill('test message');
    
    // Attempt click - may be disabled due to auth
    const sendButton = frame.getByTestId('chat-send');
    const isDisabled = await sendButton.isDisabled();
    
    if (!isDisabled) {
      await sendButton.click();
      // Wait for auth check to complete
      await page.waitForTimeout(1500);
    }

    // Auth banner should appear
    const authBanner = frame.getByTestId('chat-auth-banner');
    await expect(authBanner).toBeVisible({ timeout: 5000 });
    await expect(authBanner).toContainText(/not signed in/i);
    
    // Input and send should be disabled after 401
    await expect(frame.getByTestId('chat-input')).toBeDisabled();
    await expect(frame.getByTestId('chat-send')).toBeDisabled();
  });
});
