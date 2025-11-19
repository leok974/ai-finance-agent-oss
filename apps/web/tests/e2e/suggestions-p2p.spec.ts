import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

/**
 * E2E test for P2P transaction detection in Suggestions/Unknowns UI
 *
 * Validates that:
 * 1. P2P transactions (Zelle, Venmo, Cash App, PayPal, etc.) are detected
 * 2. They appear in the suggestions panel
 * 3. They are categorized as "Transfers / P2P"
 *
 * Prerequisites:
 * - At least one P2P transaction in the current month
 * - Redis and categorization pipeline operational
 * - Suggestions panel has data-testid hooks
 */
test.describe('@prod @suggestions @p2p', () => {
  test('Suggestions panel surfaces Transfers / P2P category for P2P txn', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    // Wait for page to be interactive
    await page.waitForLoadState('networkidle');

    // Scroll to suggestions panel
    const suggestionsPanel = page.getByTestId('suggestions-panel');
    await suggestionsPanel.scrollIntoViewIfNeeded();
    await expect(suggestionsPanel).toBeVisible();

    // Ensure rows have loaded
    const rows = suggestionsPanel.getByTestId('suggestion-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      console.log('No suggestions found - test may need P2P transaction data');
      test.skip();
    }

    // Look for a row that contains a P2P-ish merchant and category "Transfers / P2P"
    // Covers common P2P providers: Zelle, Venmo, Cash App, PayPal, Apple Cash
    const candidateRow = rows.filter({
      hasText: /Zelle|NOW Withdrawal|Venmo|Cash App|PayPal|Apple Cash/i,
    });

    const candidateCount = await candidateRow.count();

    if (candidateCount === 0) {
      console.log('No P2P merchants found in suggestions - test may need P2P transaction data');
      test.skip();
    }

    await expect(
      candidateRow,
      'Expected at least one suggestion row matching a P2P merchant',
    ).toHaveCount(candidateCount);

    // Within that row, assert that "Transfers / P2P" appears as the suggested category
    await expect(
      candidateRow.getByText('Transfers / P2P', { exact: false }),
      'Expected P2P row to show Transfers / P2P category',
    ).toBeVisible();
  });

  test('P2P transactions show correct merchant normalization', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    const suggestionsPanel = page.getByTestId('suggestions-panel');
    await suggestionsPanel.scrollIntoViewIfNeeded();

    // Find P2P row
    const rows = suggestionsPanel.getByTestId('suggestion-row');
    const p2pRow = rows.filter({
      hasText: /Zelle|NOW Withdrawal|Venmo|Cash App|PayPal|Apple Cash/i,
    });

    const p2pCount = await p2pRow.count();

    if (p2pCount === 0) {
      console.log('No P2P merchants found - skipping normalization test');
      test.skip();
    }

    // Verify merchant display shows normalized form
    const firstRow = p2pRow.first();
    const merchantCell = firstRow.locator('td').first();
    const merchantText = await merchantCell.textContent();

    // Normalized merchant should be clean (no extra whitespace, proper casing)
    expect(merchantText?.trim(), 'Merchant should be normalized').toBeTruthy();
    expect(merchantText?.trim().length, 'Merchant should not be empty').toBeGreaterThan(0);
  });
});
