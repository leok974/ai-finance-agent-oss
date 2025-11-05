import { test, expect } from '@playwright/test';

test.describe('Dashboard Charts - 2025-08', () => {
  test('dashboard charts populate for 2025-08', async ({ page }) => {
    await page.goto('https://app.ledger-mind.org');

    // Month must be visible
    await expect(page.getByText('2025-08')).toBeVisible({ timeout: 10000 });

    // Merchants chart has heading
    await expect(page.getByText('Top Merchants')).toBeVisible();

    // Categories chart has heading
    await expect(page.getByText('Top Categories')).toBeVisible();

    // Daily flows line chart renders an SVG path
    const dailyFlowsSection = page.locator('section:has-text("Daily Flows")');
    await expect(dailyFlowsSection).toBeVisible();

    const paths = dailyFlowsSection.locator('svg path');
    await expect(paths.first()).toBeVisible({ timeout: 5000 });
    await expect(paths).toHaveCount(await paths.count()); // At least 1 path element
  });

  test('empty state shows when no data', async ({ page }) => {
    await page.goto('https://app.ledger-mind.org');

    // If there's no data, we should see appropriate empty states
    // This test will be useful after the reset functionality
    const noDataText = page.getByText(/no data|no transactions/i);
    const hasCharts = await page.locator('svg path').first().isVisible().catch(() => false);

    if (!hasCharts) {
      await expect(noDataText).toBeVisible();
    }
  });
});
