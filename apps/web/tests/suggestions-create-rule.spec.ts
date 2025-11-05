import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('Create rule posts a categorize rule and shows Created', async ({ page }) => {
  await page.route('**/agent/tools/suggestions', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [{
          kind: 'categorize',
          merchant: 'COFFEE CO',
          suggest_category: 'Food & Drink',
          confidence: 0.92,
          support: 4,
          example_txn_id: 1234,
          month: '2025-10'
        }]
      })
    });
  });

  interface Hit { url: string; body: unknown }
  const saveHits: Hit[] = [];
  const okFulfill = (route: import('@playwright/test').Route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'e2e-rule-1' }) });

  await page.route('**/agent/tools/rules/save', async route => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    saveHits.push({ url: req.url(), body });
    const bodyStr = JSON.stringify(body);
    expect(/categorize/.test(bodyStr) || /set_category/.test(bodyStr), `Unexpected save payload: ${bodyStr}`).toBeTruthy();
    await okFulfill(route);
  });

  await page.route('**/api/rules/save', async route => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    saveHits.push({ url: req.url(), body });
    await okFulfill(route);
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const panel = page.getByTestId('suggestions-panel');
  if (await panel.count() === 0) {
    test.skip(true, 'Suggestions feature disabled in this environment.');
  }

  const createBtn = page.getByTestId('suggestions-create').first();
  await expect(createBtn).toBeVisible();
  await createBtn.click();

  await expect(page.getByText('Saving…').first()).toBeVisible();
  await expect(page.getByText('Created').first()).toBeVisible();
  // Toast should appear then auto-dismiss
  await expect(page.getByTestId('toast')).toContainText(/Rule created/i);
  await expect(page.getByTestId('toast')).toBeHidden({ timeout: 3000 });
    // After success, original button for that row should be gone (no Create buttons left or at least fewer)
    await expect(page.getByTestId('suggestions-create')).toHaveCount(0);

  expect(saveHits.length).toBeGreaterThan(0);
  const merged = JSON.stringify(saveHits[0].body);
  expect(merged).toContain('COFFEE CO');
  expect(merged).toMatch(/Food & Drink|set_category|categorize/);
});
