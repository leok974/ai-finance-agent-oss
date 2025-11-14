/**
 * chat-auth-banner.spec.ts
 * 
 * Verifies that when a user encounters a 401 error:
 * 1. The auth banner is shown at the top of the composer
 * 2. The input field is disabled
 * 3. The send button is disabled
 * 4. No error message bubbles are added to the chat
 */

import { test, expect } from '@playwright/test';

// TODO: This test requires backend to return proper 401 responses
// Currently skipped pending backend auth behavior investigation
test.skip('@prod-critical shows auth banner after 401 and disables input', async ({ browser }) => {
  // Create a context WITHOUT auth state (no cookies)
  const context = await browser.newContext({
    // Don't use storageState to avoid loading auth cookies
  });
  
  const page = await context.newPage();

  try {
    // Navigate to chat iframe in standalone mode
    // Use ignoreHTTPSErrors since we might hit auth redirects
    await page.goto('https://app.ledger-mind.org/?chat=1&prefetch=0&panel=0', {
      waitUntil: 'networkidle'
    });

    // Wait for iframe to load
    const frame = page.frameLocator('#lm-chat-iframe');

    // Initially banner should not be visible (authOk defaults to true)
    const banner = frame.getByTestId('chat-auth-banner');
    
    // Wait for input to be available
    const input = frame.getByTestId('chat-input');
    await input.waitFor({ state: 'visible', timeout: 10000 });
    
    // Banner should not be visible yet
    await expect(banner).not.toBeVisible();

    // Try to send a message - this should trigger 401 and show banner
    await input.fill('test message');
    
    const sendBtn = frame.getByTestId('chat-send');
    
    // Use JS click to bypass interception (as documented in E2E_CHAT_NOTES.md)
    await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
      const btn = iframe?.contentDocument?.querySelector<HTMLButtonElement>('[data-testid="chat-send"]');
      btn?.click();
    });

    // Wait for banner to appear after 401 response
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText("You're not signed in");
    await expect(banner).toContainText('Sign in');

    // Input field should now be disabled
    await expect(input).toBeDisabled();

    // Send button should be disabled
    await expect(sendBtn).toBeDisabled();

    // Verify the sign-in link exists
    const signInLink = banner.locator('a[href="/login"]');
    await expect(signInLink).toBeVisible();
    
    // Verify NO error message bubble was added to chat
    const errorBubble = frame.locator('.bubble:has-text("Request failed: HTTP 401")');
    await expect(errorBubble).not.toBeVisible();
    
  } finally {
    await context.close();
  }
});

test('hides auth banner when authenticated', async ({ page }) => {
  // This test uses the default auth state from global setup
  
  // Navigate to chat iframe
  await page.goto('/?chat=1&prefetch=0&panel=0');
  
  const frame = page.frameLocator('#lm-chat-iframe');
  
  // Auth banner should NOT be visible
  const banner = frame.getByTestId('chat-auth-banner');
  await expect(banner).not.toBeVisible();
  
  // Input should be enabled
  const input = frame.getByTestId('chat-input');
  await expect(input).not.toBeDisabled();
  
  // Send button should be enabled when text is entered
  await input.fill('test message');
  const sendBtn = frame.getByTestId('chat-send');
  await expect(sendBtn).not.toBeDisabled();
});
