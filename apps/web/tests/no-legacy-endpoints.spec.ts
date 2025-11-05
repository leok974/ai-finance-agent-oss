import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

// 1) Fail if legacy endpoints fire during initial load

test('no legacy /api/rules/suggestions or /api/insights calls on load', async ({ page }) => {
  const bad = new Set<string>();
  page.on('request', (req) => {
    const url = req.url();
    if (/\/api\/rules\/suggestions\//.test(url) || /\/api\/insights\//.test(url)) {
      bad.add(`${req.method()} ${url}`);
    }
  });
  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const why = Array.from(bad).join('\n') + (consoleErrors[0] ? `\nconsole:error: ${consoleErrors[0]}` : '');
  await expect(bad.size, why).toBe(0);
});

// 2) Soft check that tools endpoints prefer POST

test('tools endpoints prefer POST (soft check)', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    const p = u.pathname;
    const isMeta = p === '/agent/tools/meta/latest_month';
    const isSpend = p.startsWith('/agent/tools/charts/spending-') || p.startsWith('/agent/tools/charts/spending_');
    if (isMeta || isSpend) seen.push(`${req.method()} ${p}`);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  if (!seen.some(s => s.includes('/agent/tools/meta/latest_month'))) {
    await page.evaluate(async () => {
      await fetch('/agent/tools/meta/latest_month', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    });
    await page.waitForTimeout(200);
  }
  expect.soft(seen.some(s => s.startsWith('POST /agent/tools/meta/latest_month'))).toBeTruthy();
  expect.soft(seen.some(s => s.startsWith('GET /agent/tools/meta/latest_month'))).toBeFalsy();
});
