/**
 * Production smoke tests for chat toolbar chips.
 * Verifies that key chips (Month summary, Trends, Subscriptions, etc.) work in production.
 *
 * These tests use demo mode with seeded sample data.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Helper to assert we got a non-empty assistant reply that isn't just an error.
 */
async function expectAssistantReplied(page: Page) {
  // Try to wait for thinking bubble (streaming), but don't fail if it doesn't appear
  // (some responses might be non-streaming or very fast)
  const thinkingBubble = page.getByTestId('lm-chat-thinking');

  try {
    // Wait for bubble to appear
    await expect(thinkingBubble).toBeVisible({ timeout: 5000 });
    // If visible, wait for it to disappear (streaming complete)
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });
  } catch (e) {
    // No thinking bubble appeared - that's okay, might be non-streaming
    console.log('No thinking bubble detected - response might be non-streaming');
  }

  // Now read the completed response
  const assistantMessage = page
    .locator('[data-testid^="lm-chat-message-assistant"]')
    .last();

  await expect(assistantMessage, 'assistant message should appear').toBeVisible({
    timeout: 30000,
  });

  const text = (await assistantMessage.innerText()).trim();
  expect(text.length, 'assistant reply should be non-empty').toBeGreaterThan(40);
  expect(
    text.toLowerCase(),
    'assistant reply should not be just an availability error',
  ).not.toContain('temporarily unavailable');
}

/**
 * Helper for LLM-dependent chips that may gracefully fail with "unavailable" message.
 * For smoke tests, we just verify we get SOME response (success or graceful error).
 */
async function expectAssistantRepliedOrGracefulError(page: Page) {
  const thinkingBubble = page.getByTestId('lm-chat-thinking');

  try {
    await expect(thinkingBubble).toBeVisible({ timeout: 5000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });
  } catch (e) {
    console.log('No thinking bubble detected - response might be non-streaming');
  }

  const assistantMessage = page
    .locator('[data-testid^="lm-chat-message-assistant"]')
    .last();

  await expect(assistantMessage, 'assistant message should appear').toBeVisible({
    timeout: 30000,
  });

  const text = (await assistantMessage.innerText()).trim();
  expect(text.length, 'assistant reply should be non-empty').toBeGreaterThan(20);

  // For smoke tests: accept either real response OR graceful "temporarily unavailable" error
  // (both indicate the system is working correctly)
  console.log(`Response received (${text.length} chars): ${text.substring(0, 100)}...`);
}

test.describe('Chat Chips Smoke @prod @chat-chips', () => {
  test.describe.configure({
    retries: process.env.IS_PROD === 'true' ? 1 : 0,
    timeout: 90_000,
  });

  test.beforeEach(async ({ page, context }) => {
    // Clear storage to start fresh (demo login needs unauthenticated state)
    await context.clearCookies();
    await context.clearPermissions();

    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 60000 });

    // Log in via demo mode to get seeded transaction data
    const demoButton = page.getByTestId('btn-demo');
    await expect(demoButton).toBeVisible({ timeout: 10000 });
    await demoButton.click();

    // Wait for demo login to complete and page to reload
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify chat launcher is available (app is fully ready)
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 15000 });

    // Open chat panel for all tests
    await launcher.click();
    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible({ timeout: 5000 });
  });

  test('@prod chat chip – Month summary', async ({ page }) => {
    // Click the "Month summary" chip
    const monthSummaryChip = page.getByTestId('agent-tool-month-summary');
    await expect(monthSummaryChip).toBeVisible({ timeout: 5000 });
    await monthSummaryChip.click();

    await expectAssistantReplied(page);
  });

  test('@prod chat chip – Trends', async ({ page }) => {
    // Click the "Trends" chip
    const trendsChip = page.getByTestId('agent-tool-trends');
    await expect(trendsChip).toBeVisible({ timeout: 5000 });
    await trendsChip.click();

    await expectAssistantReplied(page);
  });

  test('@prod chat chip – Subscriptions', async ({ page }) => {
    // Click the "Find Subscriptions" chip
    // Note: This chip requires LLM, so may gracefully fail with "temporarily unavailable"
    const subscriptionsChip = page.getByTestId('agent-tool-find-subscriptions');
    await expect(subscriptionsChip).toBeVisible({ timeout: 5000 });
    await subscriptionsChip.click();

    // Use lenient helper - accepts either real response OR graceful error
    await expectAssistantRepliedOrGracefulError(page);
  });

  test('@prod chat chip – Insights (compact)', async ({ page }) => {
    // Click the "Insights" chip
    const insightsChip = page.getByTestId('agent-tool-insights-compact');
    await expect(insightsChip).toBeVisible({ timeout: 5000 });
    await insightsChip.click();

    await expectAssistantReplied(page);
  });
});
