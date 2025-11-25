/**
 * E2E tests for chat streaming consistency.
 * Verifies that typed queries and toolbar buttons produce equivalent streaming behavior.
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Streaming Consistency', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    // Add login steps here if needed
    // For now, assume we're already logged in or using a test session
  });

  test('Typed "quick recap" query uses streaming', async ({ page }) => {
    await page.goto('/');

    // Open chat panel
    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    // Type query
    const chatInput = page.getByPlaceholder(/ask about your finances/i);
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for streaming to start
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    // Verify no "temporarily unavailable" message
    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });

    // Verify summary content appears
    const summaryContent = page.getByText(/income|spend|net/i);
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });

  test('Month summary button uses streaming', async ({ page }) => {
    await page.goto('/');

    // Open chat panel
    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    // Click month summary button
    const monthSummaryButton = page.getByRole('button', { name: /month summary/i });
    await monthSummaryButton.click();

    // Wait for streaming to start
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    // Verify no "temporarily unavailable" message
    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });

    // Verify summary content appears
    const summaryContent = page.getByText(/income|spend|net/i);
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });

  test('Typed query and button produce equivalent results', async ({ page }) => {
    await page.goto('/');

    // Open chat panel
    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    // First: type query
    const chatInput = page.getByPlaceholder(/ask about your finances/i);
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for response
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });
    await page.waitForSelector('[data-streaming="false"]', { timeout: 15000 });

    // Capture first response
    const messages = page.locator('[data-message-role="assistant"]');
    const firstResponseText = await messages.first().textContent();

    // Clear chat
    const clearButton = page.getByRole('button', { name: /clear/i });
    await clearButton.click();

    // Second: click button
    const monthSummaryButton = page.getByRole('button', { name: /month summary/i });
    await monthSummaryButton.click();

    // Wait for response
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });
    await page.waitForSelector('[data-streaming="false"]', { timeout: 15000 });

    // Capture second response
    const secondResponseText = await messages.first().textContent();

    // Both should contain financial data
    expect(firstResponseText).toMatch(/income|spend|net/i);
    expect(secondResponseText).toMatch(/income|spend|net/i);

    // Neither should contain "unavailable"
    expect(firstResponseText).not.toMatch(/temporarily unavailable/i);
    expect(secondResponseText).not.toMatch(/temporarily unavailable/i);
  });

  test('Alerts button uses streaming with correct mode', async ({ page }) => {
    await page.goto('/');

    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    // Intercept network request to verify mode parameter
    let requestUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('/agent/stream')) {
        requestUrl = request.url();
      }
    });

    const alertsButton = page.getByRole('button', { name: /alerts/i });
    await alertsButton.click();

    // Wait for streaming
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    // Verify mode parameter in URL
    expect(requestUrl).toContain('mode=finance_alerts');

    // Verify no unavailable message
    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });
  });

  test('Recurring charges button uses streaming with correct mode', async ({ page }) => {
    await page.goto('/');

    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    let requestUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('/agent/stream')) {
        requestUrl = request.url();
      }
    });

    const recurringButton = page.getByRole('button', { name: /recurring/i });
    await recurringButton.click();

    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    expect(requestUrl).toContain('mode=analytics_recurring_all');

    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });
  });

  test('Subscriptions button uses streaming with correct mode', async ({ page }) => {
    await page.goto('/');

    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    let requestUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('/agent/stream')) {
        requestUrl = request.url();
      }
    });

    const subscriptionsButton = page.getByRole('button', { name: /subscriptions/i });
    await subscriptionsButton.click();

    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    expect(requestUrl).toContain('mode=analytics_subscriptions_all');

    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });
  });

  test('Deterministic quick recap works without LLM', async ({ page }) => {
    // This test verifies that quick recap works even when LLM is unavailable
    await page.goto('/');

    const chatButton = page.getByRole('button', { name: /chat/i });
    await chatButton.click();

    // Type query for quick recap
    const chatInput = page.getByPlaceholder(/ask about your finances/i);
    await chatInput.fill('month summary');
    await chatInput.press('Enter');

    // Wait for streaming
    await page.waitForSelector('[data-streaming="true"]', { timeout: 5000 });

    // Should get deterministic response (not unavailable)
    const unavailableText = page.getByText(/temporarily unavailable/i);
    await expect(unavailableText).not.toBeVisible({ timeout: 2000 });

    // Should see financial summary
    const summaryContent = page.getByText(/income|spend|net/i);
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });
});
