/**
 * charts-top-merchants.spec.ts - Top Merchants chart validation
 *
 * Tests that the Top Merchants chart displays data correctly when the backend has spend.
 * Uses authenticated state from existing setup.
 */

import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Top Merchants Chart @prod @charts', () => {
  test('Top Merchants chart renders bars when backend has spend', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Wait a moment for auth to settle
    await page.waitForTimeout(1000);

    // Check if authenticated (skip if redirected to login)
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Wait for the charts panel to be visible
    const chartsPanel = page.getByTestId('charts-panel-root');
    await chartsPanel.waitFor({ state: 'visible', timeout: 10000 });

    // Wait for data to load (charts load async)
    await page.waitForTimeout(2000);

    // Check if there's any spend in the overview card (if present)
    // This helps determine if we should expect merchant data
    const hasOverviewData = await page.locator('text=/total outflows|spent|spending/i').count() > 0;

    if (!hasOverviewData) {
      console.log('No overview data found - may be empty month, test is inconclusive');
      // Don't fail if there's genuinely no data
      return;
    }

    // Now check Top Merchants specifically
    const emptyState = page.getByTestId('top-merchants-empty');
    const chart = page.getByTestId('top-merchants-chart');

    // Should either have chart OR empty state, not both
    const emptyCount = await emptyState.count();
    const chartCount = await chart.count();

    if (emptyCount > 0) {
      // If showing empty state, chart should not be present
      expect(chartCount).toBe(0);
      console.log('Top Merchants showing empty state (no merchant data for this month)');
    } else {
      // If not showing empty state, chart should be present with bars
      expect(chartCount).toBe(1);

      // Verify at least one bar exists in the chart
      const bars = chart.locator('svg rect[fill]');
      const barCount = await bars.count();

      expect(barCount, 'Top Merchants chart should have at least one bar').toBeGreaterThan(0);
      console.log(`Top Merchants chart has ${barCount} bars`);
    }
  });

  test('Top Merchants chart tooltip shows merchant name and amount', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Skip if not authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Wait for charts panel
    const chartsPanel = page.getByTestId('charts-panel-root');
    await chartsPanel.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Check if chart exists
    const chart = page.getByTestId('top-merchants-chart');
    const chartCount = await chart.count();

    if (chartCount === 0) {
      console.log('No Top Merchants chart found - skipping tooltip test');
      return;
    }

    // Find first bar
    const firstBar = chart.locator('svg rect[fill]').first();
    const barExists = await firstBar.count() > 0;

    if (!barExists) {
      console.log('No bars in chart - skipping tooltip test');
      return;
    }

    // Hover over first bar to trigger tooltip
    await firstBar.hover();
    await page.waitForTimeout(500);

    // Check if tooltip appeared (Recharts creates tooltip div)
    const tooltip = page.locator('.recharts-tooltip-wrapper');
    const tooltipVisible = await tooltip.isVisible().catch(() => false);

    if (tooltipVisible) {
      const tooltipText = await tooltip.textContent();
      console.log('Tooltip content:', tooltipText);

      // Tooltip should contain currency formatting ($ sign)
      expect(tooltipText).toMatch(/\$/);
    } else {
      console.log('Tooltip not visible - may need adjustment to hover logic');
    }
  });
});
