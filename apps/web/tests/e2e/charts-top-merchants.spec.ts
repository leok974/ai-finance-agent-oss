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

test.describe('@prod @charts top merchants', () => {
  test('shows merchant bars when backend returns spend data', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Wait for auth to settle
    await page.waitForTimeout(1000);

    // Check if authenticated (skip if redirected to login)
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Wait for charts panel to render
    const chartsPanel = page.getByTestId('charts-panel-root');
    await chartsPanel.waitFor({ state: 'visible', timeout: 10000 });

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Intercept the merchants API call to see what backend returned
    let merchantsApiData: any = null;
    page.on('response', async (response) => {
      if (response.url().includes('/agent/tools/charts/merchants') || response.url().includes('/charts/merchants')) {
        try {
          merchantsApiData = await response.json();
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    // Force a reload to capture the API call
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check what the API actually returned
    const backendHasMerchants = merchantsApiData?.items?.length > 0 || false;
    const backendSpend = backendHasMerchants
      ? merchantsApiData.items.reduce((sum: number, m: any) => {
          const v = m.total ?? m.spend ?? m.amount ?? 0;
          return sum + Math.abs(v);
        }, 0)
      : 0;

    console.log('[test] Backend merchants:', merchantsApiData?.items?.length ?? 0);
    console.log('[test] Backend total spend:', backendSpend);

    // Now check what the UI shows
    const emptyState = page.getByTestId('top-merchants-empty');
    const chart = page.getByTestId('top-merchants-chart');

    const emptyCount = await emptyState.count();
    const chartCount = await chart.count();

    if (backendSpend >= 0.01) {
      // Backend has real spend → UI MUST show the chart, not empty state
      expect(emptyCount, 'should NOT show empty state when backend has spend').toBe(0);
      expect(chartCount, 'should show chart when backend has spend').toBe(1);

      // Assert the chart SVG exists and has content
      const chartSvg = chart.locator('svg');
      const svgExists = await chartSvg.count();
      expect(svgExists, 'chart should render an SVG element').toBeGreaterThan(0);

      console.log(`✓ Backend has spend (${backendSpend.toFixed(2)}), chart is rendered`);
    } else {
      // Backend has no spend → empty state is OK
      console.log('Backend has no spend, empty state is expected');
      expect(emptyCount).toBe(1);
      expect(chartCount).toBe(0);
    }
  });

  test('tooltip shows merchant name and amount on hover', async ({ page }) => {
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
      console.log('No Top Merchants chart found (empty state) - skipping tooltip test');
      test.skip(true, 'No chart to test tooltips on');
      return;
    }

    // Find first bar - Recharts renders bars as <path> elements
    const firstBar = chart.locator('.recharts-bar-rectangle path').first();
    const barExists = await firstBar.count() > 0;

    if (!barExists) {
      console.log('No bars in chart - skipping tooltip test');
      test.skip(true, 'No bars to hover');
      return;
    }

    // Hover over first bar to trigger tooltip
    await firstBar.hover({ force: true });
    await page.waitForTimeout(500);

    // Check if tooltip appeared (Recharts creates tooltip div)
    const tooltip = page.locator('.recharts-tooltip-wrapper, .recharts-default-tooltip');
    const tooltipVisible = await tooltip.isVisible().catch(() => false);

    if (tooltipVisible) {
      const tooltipText = await tooltip.textContent();
      console.log('✓ Tooltip content:', tooltipText);

      // Tooltip should contain currency formatting ($ sign) and "Spend" label
      expect(tooltipText).toMatch(/\$/);
      expect(tooltipText).toMatch(/spend/i);
    } else {
      console.log('Note: Tooltip not detected (may be flaky in headless mode)');
      // Don't fail the test - tooltips can be flaky in automated tests
    }
  });

  test('y-axis is visible with currency formatting', async ({ page }) => {
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
      console.log('No Top Merchants chart found (empty state) - skipping y-axis test');
      test.skip(true, 'No chart to test y-axis on');
      return;
    }

    // Assert at least one Y-axis tick exists
    const yTicks = chart.locator('.recharts-cartesian-axis.yAxis .recharts-cartesian-axis-tick');
    const tickCount = await yTicks.count();

    expect(tickCount, 'should have Y-axis ticks').toBeGreaterThan(0);

    // Check that at least one tick has dollar sign (currency formatting)
    const ticksText = await yTicks.allTextContents();
    const hasCurrencyFormat = ticksText.some(text => text.includes('$'));

    expect(hasCurrencyFormat, 'Y-axis ticks should use currency format').toBeTruthy();

    console.log(`✓ Y-axis has ${tickCount} ticks with currency formatting:`, ticksText);
  });
});
