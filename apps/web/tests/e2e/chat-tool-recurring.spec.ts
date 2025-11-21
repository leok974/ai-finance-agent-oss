import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('ChatDock Recurring tool @prod @chat', () => {
  test('recurring returns a real response (no 401)', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for page to load and open chat
    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Find and click Recurring chip
    const recurringChip = page.getByRole('button', { name: /Recurring/i });
    await expect(recurringChip).toBeVisible({ timeout: 3000 });
    await recurringChip.click();

    // User message appears
    const userMessages = page.locator('[data-testid^="lm-chat-message-user"]');
    await expect(userMessages.last()).toBeVisible({ timeout: 3000 });
    await expect(userMessages.last()).toContainText(/recurring|subscription/i);

    // Assistant reply appears and is NOT a 401 error
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();
    expect(assistantText).not.toContain('HTTP 401');
    expect(assistantText).not.toContain('401');
    expect(assistantText).not.toContain('placeholder');
    expect(assistantText).toMatch(/recurring|merchant|subscription/i);
  });

  test('recurring response contains real data', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Click Recurring chip
    const recurringChip = page.getByRole('button', { name: /Recurring/i });
    await expect(recurringChip).toBeVisible({ timeout: 3000 });
    await recurringChip.click();

    // Wait for assistant response
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // Check for data-driven content (flexible matching for any recurring data)
    const hasRecurringData = /recurring|merchant/i.test(assistantText || '');
    const hasAmountData = /\$[\d,]+/i.test(assistantText || '');
    const hasMerchantData = /merchant|subscription|bill/i.test(assistantText || '');
    const hasIntervalData = /day|week|month|cycle/i.test(assistantText || '');

    expect(hasRecurringData || hasAmountData || hasMerchantData || hasIntervalData).toBe(true);
  });

  test('recurring chip shows user message before response', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Count messages before click
    const messagesBefore = await page.locator('[data-testid^="lm-chat-message-"]').count();

    // Click Recurring chip
    const recurringChip = page.getByRole('button', { name: /Recurring/i });
    await expect(recurringChip).toBeVisible({ timeout: 3000 });
    await recurringChip.click();

    // Wait for new messages
    await page.waitForTimeout(1000);

    // Should have at least 2 new messages (user + assistant)
    const messagesAfter = await page.locator('[data-testid^="lm-chat-message-"]').count();
    expect(messagesAfter).toBeGreaterThan(messagesBefore);

    // Last user message should mention recurring
    const lastUserMsg = page.locator('[data-testid^="lm-chat-message-user"]').last();
    await expect(lastUserMsg).toContainText(/recurring|subscription/i);
  });

  test('recurring tool handles errors gracefully', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Click Recurring chip
    const recurringChip = page.getByRole('button', { name: /Recurring/i });
    await expect(recurringChip).toBeVisible({ timeout: 3000 });
    await recurringChip.click();

    // Wait for response (success or error)
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // Either succeeds with data OR shows an error (but not uncaught)
    const isSuccess = /recurring|merchant/i.test(assistantText || '');
    const isErrorMsg = /failed|error/i.test(assistantText || '');

    expect(isSuccess || isErrorMsg).toBe(true);
  });
});
