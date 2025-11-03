import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('suggestions panel absent => no suggestions/rules calls on load (skip if enabled)', async ({ page }) => {
  const hits: string[] = [];
  const track = (url: string) => {
    if (/\/agent\/tools\/suggestions\b/.test(url)) hits.push(`SUG ${url}`);
    if (/\/agent\/tools\/rules\/save\b/.test(url)) hits.push(`RULE ${url}`);
    if (/\/api\/rules\/suggestions\b/.test(url)) hits.push(`LEGACY_SUG ${url}`);
    if (/\/api\/insights\//.test(url)) hits.push(`LEGACY_INS ${url}`);
  };

  page.on('request', req => track(req.url()));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const panelCount = await page.getByTestId('suggestions-panel').count();
  test.skip(panelCount > 0, 'Suggestions feature enabled; skipping disabled test.');

  await page.waitForTimeout(500);
  expect(hits, `Saw unexpected requests:\n${hits.join('\n')}`).toHaveLength(0);
});
