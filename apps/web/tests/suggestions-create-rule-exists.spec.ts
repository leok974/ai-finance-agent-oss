import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('Create rule shows Exists on idempotent backend', async ({ page }) => {
  await page.route('**/agent/tools/suggestions', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{
        kind: 'categorize',
        merchant: 'COFFEE CO',
        suggest_category: 'Food & Drink',
        confidence: 0.9,
        support: 3,
        month: '2025-10'
      }] })
    });
  });

  await page.route('**/agent/tools/rules/save', async route => {
    await route.fulfill({ status: 409, headers: { 'content-type': 'text/plain' }, body: 'exists' });
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('suggestions-panel');
  test.skip(await panel.count() === 0, 'Suggestions disabled');

  const btn = page.getByTestId('suggestions-create').first();
  await expect(btn).toBeVisible();
  await btn.click();

  await expect(page.getByText('Exists').first()).toBeVisible();
  await expect(page.getByTestId('suggestions-create')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText(/already exists/i);
  await expect(page.getByTestId('toast')).toBeHidden({ timeout: 3000 });
});
