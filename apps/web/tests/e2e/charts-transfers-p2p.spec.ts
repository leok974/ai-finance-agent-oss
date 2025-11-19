import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('@prod @charts @p2p', () => {
  test('Transfers / P2P category is visible in charts when P2P txns exist', async ({ page }) => {
    // Use prod storage state (chromium-prod) – already logged in
    await page.goto(BASE_URL, { waitUntil: 'load' });

    // Scroll to charts panel
    const chartsRoot = page.getByTestId('charts-panel-root');
    await chartsRoot.scrollIntoViewIfNeeded();
    await expect(chartsRoot).toBeVisible();

    // Top Categories card: we expect the Transfers / P2P category to appear
    const categoriesCard = chartsRoot.getByTestId('top-categories-card');
    await expect(categoriesCard).toBeVisible();

    // Legend label (e.g. in a list, pill, or tooltip)
    const p2pLegend = categoriesCard.getByText('Transfers / P2P', { exact: false });

    // This should be visible when a Zelle/Venmo/etc txn is present
    await expect(p2pLegend, 'Transfers / P2P legend should be visible when P2P txns exist')
      .toBeVisible();

    // Optional: ensure there is at least one bar > 0 in the categories chart
    const categoriesChart = categoriesCard.getByTestId('top-categories-chart');
    await expect(categoriesChart).toBeVisible();

    const bars = categoriesChart.locator('svg rect');
    await expect(bars, 'Expected at least one bar in categories chart').toHaveCount(
      await bars.count().then(c => Math.max(c, 1)),
    );
  });
});
