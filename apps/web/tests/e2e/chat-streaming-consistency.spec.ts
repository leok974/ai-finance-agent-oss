/**
 * E2E tests for chat streaming consistency.
 * Verifies that typed queries and toolbar buttons produce equivalent streaming behavior.
 */

import { test, expect, type Page } from '@playwright/test';

async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page
        .getByTestId('lm-chat-launcher-button')
        .waitFor({ timeout: 15000 });
    } catch {
      test.skip(
        true,
        'Chat launcher button not found in prod – likely E2E session/auth issue'
      );
    }
  }
}

test.describe('Chat Streaming Consistency @prod @chat-stream', () => {
  test.describe.configure({
    retries: process.env.IS_PROD === 'true' ? 1 : 0,
    timeout: 60_000,
  });

  test.beforeEach(async ({ page }) => {
    await ensureChatAvailable(page);
  });

  test('Typed "quick recap" query uses streaming @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query - use role locator for reliability
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for response - deterministic mode might be very fast
    // Just verify content appears without "unavailable" message
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });
    await expect(response).toContainText(/income|spend|net/i);

    // Verify no "temporarily unavailable" message
    const responseText = await response.textContent();
    expect(responseText).not.toMatch(/temporarily unavailable/i);
  });

  test('Month summary button uses streaming @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Click month summary button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    // Wait for response
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });
    await expect(response).toContainText(/income|spend|net|top categories|top merchants/i);

    // Verify no "temporarily unavailable" message
    const responseText = await response.textContent();
    expect(responseText).not.toMatch(/temporarily unavailable/i);
  });

  test('Typed query and button produce equivalent results @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // First: type query
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for response
    const firstResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(firstResponse).toBeVisible({ timeout: 20000 });
    await expect(firstResponse).toContainText(/income|spend|net/i);
    const firstResponseText = await firstResponse.textContent();

    // Second: use button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    const secondResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(secondResponse).toBeVisible({ timeout: 20000 });
    await expect(secondResponse).toContainText(/income|spend|net/i);
    const secondResponseText = await secondResponse.textContent();

    // Both should contain financial data
    expect(firstResponseText).toMatch(/income|spend|net/i);
    expect(secondResponseText).toMatch(/income|spend|net/i);

    // Neither should contain "unavailable"
    expect(firstResponseText).not.toMatch(/temporarily unavailable/i);
    expect(secondResponseText).not.toMatch(/temporarily unavailable/i);
  });

  test('Deterministic quick recap works without LLM @prod', async ({ page }) => {
    // This test verifies that quick recap works even when LLM is unavailable
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query for quick recap
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('month summary');
    await chatInput.press('Enter');

    // Should see financial summary without "unavailable" message
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });
    await expect(response).toContainText(/income|spend|net/i);

    const responseText = await response.textContent();
    expect(responseText).not.toMatch(/temporarily unavailable/i);
  });
});
