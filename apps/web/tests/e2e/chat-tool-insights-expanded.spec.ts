import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('ChatDock Insights expanded tool @prod @chat', () => {
  test('runs Insights (Q) and returns a real response', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for page to load and open chat
    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Find and click Insights (Q) chip
    const insightsChip = page.getByRole('button', { name: /Insights \(Q\)/i });
    await expect(insightsChip).toBeVisible({ timeout: 3000 });
    await insightsChip.click();

    // User message appears
    const userMessages = page.locator('[data-testid^="lm-chat-message-user"]');
    await expect(userMessages.last()).toBeVisible({ timeout: 3000 });
    await expect(userMessages.last()).toContainText(/insights/i);

    // Assistant reply appears and is NOT a 401 error
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();
    expect(assistantText).not.toContain('HTTP 401');
    expect(assistantText).not.toContain('401');
    expect(assistantText).not.toContain('placeholder');
    expect(assistantText).toMatch(/insights for|spend|income|net/i);
  });

  test('insights response contains real data', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    const insightsChip = page.getByRole('button', { name: /Insights \(Q\)/i });
    await expect(insightsChip).toBeVisible({ timeout: 3000 });
    await insightsChip.click();

    // Wait for assistant response
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // Check for data-driven content (flexible matching for any insights data)
    const hasSpendData = /spend|spent|spending/i.test(assistantText || '');
    const hasIncomeData = /income|earn/i.test(assistantText || '');
    const hasNetData = /net/i.test(assistantText || '');
    const hasInsightData = /insights?|analysis|summary/i.test(assistantText || '');

    expect(hasSpendData || hasIncomeData || hasNetData || hasInsightData).toBe(true);
  });

  test('insights chip shows user message before response', async ({ page }) => {
    await page.goto(process.env.BASE_URL || 'https://app.ledger-mind.org');

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    await expect(page.getByTestId('lm-chat-shell')).toBeVisible({ timeout: 3000 });

    // Get initial message count
    const initialUserMessages = page.locator('[data-testid^="lm-chat-message-user"]');
    const initialCount = await initialUserMessages.count();

    const insightsChip = page.getByRole('button', { name: /Insights \(Q\)/i });
    await insightsChip.click();

    // Verify a new user message was added
    await expect(initialUserMessages).toHaveCount(initialCount + 1, { timeout: 3000 });

    // Verify the user message contains expected text
    const lastUserMsg = initialUserMessages.last();
    await expect(lastUserMsg).toContainText(/insights|month/i);
  });

  test('insights tool handles errors gracefully', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    await expect(page.getByTestId('lm-chat-shell')).toBeVisible({ timeout: 3000 });

    const insightsChip = page.getByRole('button', { name: /Insights \(Q\)/i });
    await insightsChip.click();

    // Wait for response (success or error)
    const assistantMessages = page.locator('[data-testid^="lm-chat-message-assistant"]');
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    const assistantText = await assistantMessages.last().textContent();

    // If it's an error, it should be informative
    if (assistantText?.includes('failed') || assistantText?.includes('error')) {
      expect(assistantText).toMatch(/insights.*failed|error loading insights/i);
    } else {
      // Otherwise it should have real data
      expect(assistantText).toMatch(/insights for|spend|income/i);
    }
  });
});
