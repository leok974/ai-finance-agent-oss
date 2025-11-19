/**
 * chat-tools-subscriptions.spec.ts - Subscriptions tool smoke test
 *
 * Verifies end-to-end tool execution flow:
 * 1. Tool chip clicked → data fetched
 * 2. Formatter creates readable output
 * 3. LLM enhancement attempted (may fallback to formatted output)
 * 4. Assistant message appears in chat
 *
 * Guards against:
 * - /agent/chat breaking (401 auth)
 * - /agent/rephrase breaking (503 unavailable)
 * - runToolWithRephrase not appending messages
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod @chat @tools', () => {
  test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

  test('Find subscriptions tool yields an assistant reply', async ({ page }) => {
    await page.goto(BASE_URL);

    // Open chat
    await page.getByTestId('lm-chat-launcher-button').click();

    // Wait for shell to be visible
    await expect(page.getByTestId('lm-chat-shell')).toBeVisible();

    // Click the "Find subscriptions" tool chip
    await page.getByText('Find subscriptions').click();

    // Wait for assistant message to appear
    // The tool should:
    // 1. Fetch analytics.subscriptions data (200 OK)
    // 2. Format it as markdown list
    // 3. Try LLM rephrase (may fail gracefully)
    // 4. Append assistant message with results
    const assistantMessage = page.locator('[data-testid="lm-chat-message-assistant"]').last();

    // Should contain subscription-related content
    await expect(assistantMessage).toContainText(/subscription|recurring|merchant/i, {
      timeout: 15000
    });

    // Should NOT show error state
    await expect(assistantMessage).not.toContainText("I couldn't fetch your subscriptions");
    await expect(assistantMessage).not.toContainText('Error');
  });
});
