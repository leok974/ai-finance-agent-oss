import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('ChatDock Budget suggest tool @prod @chat', () => {
  test('budget_suggest returns a real response (no 401)', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for page to load and open chat
    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Find and click Budget Suggest chip
    const budgetChip = page.getByRole('button', { name: /Budget Suggest/i });
    await expect(budgetChip).toBeVisible({ timeout: 3000 });
    await budgetChip.click();

    // User message appears
    const userMessages = page.locator('[data-testid^="lm-chat-message-user"]');
    await expect(userMessages.last()).toBeVisible({ timeout: 3000 });
    await expect(userMessages.last()).toContainText(/budget/i);

    // Assistant reply appears and is NOT a 401 error
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();
    expect(assistantText).not.toContain('HTTP 401');
    expect(assistantText).not.toContain('401');
    expect(assistantText).not.toContain('placeholder');
    expect(assistantText).toMatch(/budget|spend|category/i);
  });

  test('budget response contains real data', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    const budgetChip = page.getByRole('button', { name: /Budget Suggest/i });
    await expect(budgetChip).toBeVisible({ timeout: 3000 });
    await budgetChip.click();

    // Wait for assistant response
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // Check for data-driven content (flexible matching for any budget data)
    const hasSpendData = /spend|spent|spending/i.test(assistantText || '');
    const hasBudgetData = /budget|suggest/i.test(assistantText || '');
    const hasCategoryData = /category|categories/i.test(assistantText || '');
    const hasAmountData = /\$[\d,]+/i.test(assistantText || '');

    expect(hasSpendData || hasBudgetData || hasCategoryData || hasAmountData).toBe(true);
  });

  test('budget chip shows user message before response', async ({ page }) => {
    await page.goto(process.env.BASE_URL || 'https://app.ledger-mind.org');

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    await expect(page.getByTestId('lm-chat-shell')).toBeVisible({ timeout: 3000 });

    // Get initial message count
    const initialUserMessages = page.locator('[data-testid^="lm-chat-message-user"]');
    const initialCount = await initialUserMessages.count();

    const budgetChip = page.getByRole('button', { name: /Budget Suggest/i });
    await budgetChip.click();

    // Verify a new user message was added
    await expect(initialUserMessages).toHaveCount(initialCount + 1, { timeout: 3000 });

    // Verify the user message contains expected text
    const lastUserMsg = initialUserMessages.last();
    await expect(lastUserMsg).toContainText(/budget|spending/i);
  });

  test('budget tool handles errors gracefully', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    await expect(page.getByTestId('lm-chat-shell')).toBeVisible({ timeout: 3000 });

    const budgetChip = page.getByRole('button', { name: /Budget Suggest/i });
    await budgetChip.click();

    // Wait for response (success or error)
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // If it's an error, it should be informative
    if (assistantText?.includes('failed') || assistantText?.includes('error')) {
      expect(assistantText).toMatch(/budget.*failed|error.*budget/i);
    } else {
      // Otherwise it should have real data
      expect(assistantText).toMatch(/budget|spend|category/i);
    }
  });
});
