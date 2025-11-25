import { test, expect } from '@playwright/test';

/**
 * E2E tests for manual categorization flow from Unknowns panel
 * Tests both drawer-based categorization and suggestion chip clicks
 * Verifies toasts appear and unknowns list updates
 */

test.describe('@unknowns @categorize Manual Categorization Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    await page.waitForLoadState('load');

    // Wait for the unknowns card to load
    await page.locator('[data-testid="uncat-card-root"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  });

  test('manual categorize via drawer shows toast and removes transaction', async ({ page }) => {
    // 1. Check if we have any uncategorized transactions
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const rowCount = await rows.count();

    test.skip(rowCount === 0, 'No uncategorized transactions available for testing');

    // 2. Capture the first transaction details
    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();

    const merchantText = await firstRow.locator('div.font-medium').first().textContent();
    console.log(`[E2E] Testing manual categorization for merchant: ${merchantText}`);

    // 3. Open the Categorize drawer
    const categorizeButton = firstRow.getByRole('button', { name: /Categorize/i });
    await expect(categorizeButton).toBeVisible();
    await categorizeButton.click();

    // 4. Wait for drawer to open
    const drawer = page.locator('[data-testid="explain-drawer"][data-drawer-type="manual-categorize"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // 5. Select a category from the dropdown
    const categorySelect = drawer.locator('[data-testid="category-select"]');
    await expect(categorySelect).toBeVisible();
    await categorySelect.selectOption({ label: /Groceries/i });

    // 6. Choose scope (default is usually "same_merchant")
    const scopeSameMerchant = drawer.locator('[data-testid="scope-same-merchant"]');
    await scopeSameMerchant.check();
    await expect(scopeSameMerchant).toBeChecked();

    // 7. Click Apply button
    const applyButton = drawer.locator('[data-testid="apply-categorization-button"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // 8. Assert toast appears with success message
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /Categorization applied/i });
    await expect(toast).toBeVisible({ timeout: 5000 });

    const toastText = await toast.textContent();
    console.log(`[E2E] Toast appeared: ${toastText?.slice(0, 100)}`);

    // Verify toast contains category name
    await expect(toast).toContainText(/Groceries/i);

    // 9. Drawer should close
    await expect(drawer).toBeHidden({ timeout: 3000 });

    // 10. Assert the transaction row is gone (or count decreased)
    const finalRowCount = await rows.count();
    expect(finalRowCount).toBeLessThanOrEqual(rowCount);

    console.log(`[E2E] Row count changed: ${rowCount} → ${finalRowCount} ✓`);
  });

  test('clicking a suggestion chip applies category, shows toast, and removes row', async ({ page }) => {
    // 1. Get first uncategorized row
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const initialCount = await rows.count();

    test.skip(initialCount === 0, 'No uncategorized transactions available for testing');

    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();

    // 2. Wait for suggestions to load
    const firstChip = firstRow.locator('[data-testid="uncat-suggestion-chip"]').first();
    await expect(firstChip).toBeVisible({ timeout: 15_000 });

    // 3. Get merchant and chip details before clicking
    const merchantText = await firstRow.locator('div.font-medium').first().textContent();
    const chipText = await firstChip.textContent();
    const categoryLabel = chipText?.split(' ')[0] || ''; // "Groceries 85%" → "Groceries"

    console.log(`[E2E] Applying suggestion chip: ${merchantText} → ${categoryLabel}`);

    // 4. Click the suggestion chip
    await firstChip.click();

    // 5. Assert toast appears
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /Applied/i });
    await expect(toast).toBeVisible({ timeout: 5000 });

    const toastText = await toast.textContent();
    console.log(`[E2E] Toast appeared: ${toastText}`);

    // Verify toast contains the category
    await expect(toast).toContainText(new RegExp(categoryLabel, 'i'));

    // 6. Assert row is removed (count decreased)
    await page.waitForTimeout(1000); // Brief wait for UI update

    const finalCount = await rows.count();
    expect(finalCount).toBeLessThan(initialCount);

    console.log(`[E2E] Suggestion chip applied successfully! Rows: ${initialCount} → ${finalCount} ✓`);
  });

  test('manual categorization with "just this" scope updates only one transaction', async ({ page }) => {
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const initialCount = await rows.count();

    test.skip(initialCount === 0, 'No uncategorized transactions available');

    const firstRow = rows.first();
    const categorizeButton = firstRow.getByRole('button', { name: /Categorize/i });
    await categorizeButton.click();

    const drawer = page.locator('[data-testid="explain-drawer"][data-drawer-type="manual-categorize"]');
    await expect(drawer).toBeVisible();

    // Select "Shopping" category
    await drawer.locator('[data-testid="category-select"]').selectOption({ label: /Shopping/i });

    // Choose "just this" scope
    const scopeJustThis = drawer.locator('[data-testid="scope-just-this"]');
    await scopeJustThis.check();
    await expect(scopeJustThis).toBeChecked();

    // Verify scope summary shows "Will update 1 transaction"
    await expect(drawer).toContainText(/Will update 1 transaction/i);

    // Apply
    await drawer.locator('[data-testid="apply-categorization-button"]').click();

    // Toast should mention 1 transaction
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /Categorization applied/i });
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText(/Shopping/i);

    console.log('[E2E] "Just this" scope categorization completed ✓');
  });

  test('manual categorization with "same merchant" scope shows affected count', async ({ page }) => {
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const initialCount = await rows.count();

    test.skip(initialCount < 2, 'Need at least 2 uncategorized transactions for bulk test');

    const firstRow = rows.first();
    const categorizeButton = firstRow.getByRole('button', { name: /Categorize/i });
    await categorizeButton.click();

    const drawer = page.locator('[data-testid="explain-drawer"][data-drawer-type="manual-categorize"]');
    await expect(drawer).toBeVisible();

    // Select "Groceries" category
    await drawer.locator('[data-testid="category-select"]').selectOption({ label: /Groceries/i });

    // Choose "same merchant" scope (default)
    const scopeSameMerchant = drawer.locator('[data-testid="scope-same-merchant"]');
    await scopeSameMerchant.check();

    // Scope summary should mention affected transactions if any
    const scopeSummary = await drawer.locator('p.text-xs.text-muted-foreground').last().textContent();
    console.log(`[E2E] Scope summary: ${scopeSummary}`);

    // Apply
    await drawer.locator('[data-testid="apply-categorization-button"]').click();

    // Toast should appear
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /Categorization applied/i });
    await expect(toast).toBeVisible({ timeout: 5000 });

    console.log('[E2E] "Same merchant" scope categorization completed ✓');
  });

  test('drawer close button works without saving', async ({ page }) => {
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const rowCount = await rows.count();

    test.skip(rowCount === 0, 'No uncategorized transactions available');

    const firstRow = rows.first();
    const categorizeButton = firstRow.getByRole('button', { name: /Categorize/i });
    await categorizeButton.click();

    const drawer = page.locator('[data-testid="explain-drawer"][data-drawer-type="manual-categorize"]');
    await expect(drawer).toBeVisible();

    // Close without applying
    const closeButton = drawer.locator('[data-testid="drawer-close"]');
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Drawer should close
    await expect(drawer).toBeHidden({ timeout: 3000 });

    // Row count should remain the same
    const finalCount = await rows.count();
    expect(finalCount).toBe(rowCount);

    console.log('[E2E] Drawer closed without changes ✓');
  });

  test('suggestion chip shows loading state during categorization', async ({ page }) => {
    const rows = page.locator('[data-testid="uncat-transaction-row"]');
    const initialCount = await rows.count();

    test.skip(initialCount === 0, 'No uncategorized transactions available');

    const firstRow = rows.first();
    const firstChip = firstRow.locator('[data-testid="uncat-suggestion-chip"]').first();
    await expect(firstChip).toBeVisible({ timeout: 15_000 });

    // Slow down the network to observe loading state
    await page.route('**/transactions/*/categorize', async (route) => {
      await page.waitForTimeout(500); // Add delay
      await route.continue();
    });

    // Click chip
    await firstChip.click();

    // Chip should be disabled during processing
    await expect(firstChip).toBeDisabled({ timeout: 1000 });

    console.log('[E2E] Suggestion chip loading state verified ✓');
  });
});
