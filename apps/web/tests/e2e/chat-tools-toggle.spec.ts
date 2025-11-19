import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('Chat Tools Toggle and Clear', () => {
  test('@prod-critical toggles tools panel inside chat shell', async ({ page }) => {
    // Navigate to the route that loads chat
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // ChatDock v2: shell in direct DOM
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await expect(shell).toBeVisible();

    // The toggle button uses the new test ID
    const toggle = page.getByTestId('lm-chat-toggle-tools');
    await expect(toggle).toBeVisible();

    // Check initial text (should be "Hide tools")
    await expect(toggle).toHaveText('Hide tools');

    // Tools section should be visible initially
    const toolsSection = page.getByTestId('lm-chat-section-insights');
    await expect(toolsSection).toBeVisible();

    // Click the toggle button to hide tools
    await toggle.click();

    // Tools should be hidden
    await expect(toolsSection).not.toBeVisible();
    await expect(toggle).toHaveText('Show tools');

    // Click again to show tools
    await toggle.click();

    // Tools should be visible again
    await expect(toolsSection).toBeVisible();
    await expect(toggle).toHaveText('Hide tools');
  });

  test('@prod-critical clear chat button works with in-app confirmation', async ({ page }) => {
    // Navigate to the route that loads chat
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // Wait for chat shell
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await expect(shell).toBeVisible();

    // Clear button should be disabled initially (no messages)
    const clearButton = page.getByTestId('lm-chat-clear');
    await expect(clearButton).toBeDisabled();

    // Send a simple message
    const input = page.locator('.lm-chat-input');
    await input.fill('Hello');
    await input.press('Enter');

    // Wait for at least one message to appear
    await page.waitForSelector('.lm-chat-message', { timeout: 10000 }).catch(() => {
      // If no .lm-chat-message, the chat might use different selectors
      // This test will need adjustment based on actual DOM
    });

    // Clear button should be enabled now
    await expect(clearButton).toBeEnabled();

    // Click clear button - should show in-app confirmation (not browser dialog)
    await clearButton.click();

    // In-app confirmation strip should appear
    const confirmStrip = page.getByTestId('lm-chat-clear-confirm');
    await expect(confirmStrip).toBeVisible();

    // Verify confirmation text
    await expect(confirmStrip).toContainText("Clear chat history");
    await expect(confirmStrip).toContainText("won't affect your transactions");

    // Click the Clear button in the confirmation
    const confirmYes = page.getByTestId('lm-chat-clear-confirm-yes');
    await confirmYes.click();

    // Confirmation strip should disappear
    await expect(confirmStrip).not.toBeVisible();

    // Wait a moment for the clear to process
    await page.waitForTimeout(1000);

    // Clear button should be disabled again
    await expect(clearButton).toBeDisabled();
  });

  test('clear chat can be cancelled', async ({ page }) => {
    // Navigate to the route that loads chat
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // Wait for chat shell
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await expect(shell).toBeVisible();

    // Send a simple message
    const input = page.locator('.lm-chat-input');
    await input.fill('Test message');
    await input.press('Enter');

    // Wait for message to appear
    await page.waitForSelector('.lm-chat-message', { timeout: 10000 }).catch(() => {});

    // Click clear button
    const clearButton = page.getByTestId('lm-chat-clear');
    await clearButton.click();

    // Confirmation should appear
    const confirmStrip = page.getByTestId('lm-chat-clear-confirm');
    await expect(confirmStrip).toBeVisible();

    // Click Cancel
    const confirmNo = page.getByTestId('lm-chat-clear-confirm-no');
    await confirmNo.click();

    // Confirmation strip should disappear
    await expect(confirmStrip).not.toBeVisible();

    // Clear button should still be enabled (messages weren't cleared)
    await expect(clearButton).toBeEnabled();
  });
});
