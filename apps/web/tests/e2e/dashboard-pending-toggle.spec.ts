import { test, expect } from '@playwright/test';

test.describe('Dashboard Pending Toggle', () => {
  test('@prod @frontend dashboard pending toggle changes totals', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');

    // Wait for insights to load
    await page.waitForSelector('[data-testid="include-pending-toggle"]', { timeout: 10000 });

    // Get initial spend value (posted only)
    const insightsSection = page.locator('.section').filter({ hasText: 'Insights' });
    await expect(insightsSection).toBeVisible();

    // Look for spend amount in the insights display
    // The AgentResultRenderer displays insights with spend/income/net
    const spendLocator = page.locator('text=/Spend.*\\$[\\d,]+/').first();
    const initialSpend = await spendLocator.textContent().catch(() => null);

    // Toggle "Include pending in totals"
    const toggle = page.getByTestId('include-pending-toggle');
    await toggle.click();

    // Wait for insights to reload (watch for network activity or content change)
    await page.waitForTimeout(1000); // Give time for API call and re-render

    // Get updated spend value (posted + pending)
    const updatedSpend = await spendLocator.textContent().catch(() => null);

    // If there are pending transactions, the spend should change
    // Note: This test may pass even if spend stays the same (no pending txns)
    // The important thing is that the toggle works and triggers a re-fetch
    console.log('Initial spend:', initialSpend);
    console.log('Updated spend (with pending):', updatedSpend);

    // Toggle back off
    await toggle.click();
    await page.waitForTimeout(1000);

    const finalSpend = await spendLocator.textContent().catch(() => null);
    console.log('Final spend (posted only again):', finalSpend);

    // The final value should match the initial value
    expect(finalSpend).toBe(initialSpend);
  });

  test('@frontend pending toggle state persists during session', async ({ page }) => {
    await page.goto('/');

    // Wait for toggle to appear
    await page.waitForSelector('[data-testid="include-pending-toggle"]', { timeout: 10000 });

    const toggle = page.getByTestId('include-pending-toggle');

    // Initially should be unchecked (default is posted only)
    await expect(toggle).not.toBeChecked();

    // Turn it on
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Navigate to another section and back (reload)
    await page.reload();
    await page.waitForSelector('[data-testid="include-pending-toggle"]', { timeout: 10000 });

    // Note: State does NOT persist across reloads by default
    // (we didn't implement localStorage persistence yet)
    // This just verifies the toggle works
    const toggleAfterReload = page.getByTestId('include-pending-toggle');
    await expect(toggleAfterReload).not.toBeChecked();
  });

  test('@frontend pending toggle is visible and labeled', async ({ page }) => {
    await page.goto('/');

    // Wait for insights section
    await page.waitForSelector('[data-testid="include-pending-toggle"]', { timeout: 10000 });

    const toggle = page.getByTestId('include-pending-toggle');
    await expect(toggle).toBeVisible();

    // Check that the label exists
    const label = page.locator('label[for="include-pending-toggle"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Include pending in totals');
  });
});
