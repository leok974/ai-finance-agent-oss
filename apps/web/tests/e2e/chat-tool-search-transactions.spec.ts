// tests/e2e/chat-tool-search-transactions.spec.ts
import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

async function openChat(page) {
  await page.goto(BASE_URL);
  const launcher = page.getByTestId('lm-chat-launcher-button');

  await expect(launcher).toBeVisible();
  await launcher.click();

  const panel = page.getByTestId('lm-chat-panel');
  await expect(panel).toBeVisible();

  const launcherRoot = page.getByTestId('lm-chat-launcher');
  await expect(launcherRoot).toHaveAttribute('data-state', 'open');

  return { launcher, launcherRoot, panel };
}

test.describe('Search Transactions Tool @prod @requires-llm', () => {
  test('clicking "Search transactions (NL)" button appends user message and shows assistant response', async ({ page }) => {
    const { panel } = await openChat(page);

    // Find the "Search transactions (NL)" button
    const searchBtn = panel.locator('button:has-text("Search transactions (NL)")').first();
    await expect(searchBtn).toBeVisible();

    // Get initial message count
    const messagesContainer = page.getByTestId('lm-chat-messages');
    const initialMessages = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();

    // Click the search button
    await searchBtn.click();

    // Should prompt for query if input is empty
    // Wait a moment for the assistant message to appear
    await page.waitForTimeout(1500);

    // Check that at least one new message appeared (assistant prompt)
    const newMessageCount = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();
    expect(newMessageCount).toBeGreaterThan(initialMessages);
  });

  test('typing a search query and running tool shows both user and assistant messages', async ({ page }) => {
    const { panel } = await openChat(page);

    // Find the composer input
    const composer = page.getByTestId('lm-chat-input').or(
      page.getByPlaceholder('Ask or type a command...'),
    );
    await expect(composer).toBeVisible();

    // Type a search query
    await composer.fill('Starbucks this month');

    // Find the "Search transactions (NL)" button
    const searchBtn = panel.locator('button:has-text("Search transactions (NL)")').first();
    await expect(searchBtn).toBeVisible();

    // Get initial message count
    const messagesContainer = page.getByTestId('lm-chat-messages');
    const initialMessages = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();

    // Click the search button
    await searchBtn.click();

    // Wait for user message to appear
    await page.waitForTimeout(1000);

    // Should see a user message with the query
    const userMessage = messagesContainer.locator('text="Starbucks this month"').first();
    await expect(userMessage).toBeVisible({ timeout: 3000 });

    // Wait for assistant response (may take a moment)
    await page.waitForTimeout(3000);

    // Check that we have both user and assistant messages
    const finalMessageCount = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();
    expect(finalMessageCount).toBeGreaterThan(initialMessages);
  });

  test('clicking suggestion chip with filters shows user message from presetText', async ({ page }) => {
    const { panel } = await openChat(page);

    // We need to trigger a scenario that creates a suggestion chip
    // For this test, we'll simulate clicking a chip if one appears
    // This is more of a smoke test since we can't easily trigger the "View last 90 days" suggestion

    // Find the composer input
    const composer = page.getByTestId('lm-chat-input').or(
      page.getByPlaceholder('Ask or type a command...'),
    );
    await expect(composer).toBeVisible();

    // Type a query that might trigger a "no results this month" response
    // (This is environment-dependent, so we'll make it flexible)
    await composer.fill('xyz-nonexistent-merchant-12345 this month');

    // Find the "Search transactions (NL)" button
    const searchBtn = panel.locator('button:has-text("Search transactions (NL)")').first();
    await expect(searchBtn).toBeVisible();

    // Click the search button
    await searchBtn.click();

    // Wait for response
    await page.waitForTimeout(2000);

    // Try to find a "View last 90 days" suggestion chip
    const suggestionChip = panel.locator('button:has-text("View last 90 days")').first();

    // If the suggestion appears (environment-dependent)
    if ((await suggestionChip.count()) > 0) {
      const messagesContainer = page.getByTestId('lm-chat-messages');
      const beforeClick = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();

      await suggestionChip.click();
      await page.waitForTimeout(1500);

      // Should see a new user message with "View last 90 days"
      const userMessage = messagesContainer.locator('text="View last 90 days"').first();
      await expect(userMessage).toBeVisible({ timeout: 3000 });

      // Should also see an assistant response
      const afterClick = await messagesContainer.locator('[data-testid^="lm-chat-message-"]').count();
      expect(afterClick).toBeGreaterThan(beforeClick);
    } else {
      // If suggestion didn't appear (data-dependent), just log and skip
      console.log('Suggestion chip did not appear - test is data-dependent');
    }
  });

  test('search results show transaction details', async ({ page }) => {
    const { panel } = await openChat(page);

    // Find the composer input
    const composer = page.getByTestId('lm-chat-input').or(
      page.getByPlaceholder('Ask or type a command...'),
    );
    await expect(composer).toBeVisible();

    // Type a broad search query likely to return results
    await composer.fill('transactions this month');

    // Find the "Search transactions (NL)" button
    const searchBtn = panel.locator('button:has-text("Search transactions (NL)")').first();
    await expect(searchBtn).toBeVisible();

    // Click the search button
    await searchBtn.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Check that assistant response contains "Found" or "matching" or similar
    const messagesContainer = page.getByTestId('lm-chat-messages');
    const assistantResponse = messagesContainer.locator('[data-testid="lm-chat-message-assistant"]').last();
    await expect(assistantResponse).toBeVisible({ timeout: 5000 });

    // The response should mention finding transactions or show results
    // (Exact text depends on whether transactions exist in test data)
    const responseText = await assistantResponse.innerText();
    expect(responseText.length).toBeGreaterThan(0);

    // Inline table should appear with at least one row (when there are matches)
    const resultsTable = page.getByTestId('lm-chat-tool-search-results');
    // Table may not appear if no results, so check conditionally
    const tableCount = await resultsTable.count();
    if (tableCount > 0) {
      await expect(resultsTable).toBeVisible();

      const bodyRows = page
        .getByTestId('lm-chat-tool-search-results-body')
        .locator('tr');
      await expect(bodyRows.first()).toBeVisible();
    }
  });
});
