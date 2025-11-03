import { test, expect } from '@playwright/test';
import { baseUrl, joinUrl, apiBase } from './utils/env';

test.describe.configure({ mode: 'serial' });

test('boot has no console errors and no 4xx/5xx', async ({ page, request }) => {
  test.slow();
  const url = joinUrl(baseUrl, '/');

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const failedResponses: { url: string; status: number }[] = [];
  page.on('response', resp => {
    const s = resp.status();
    if (s >= 400) failedResponses.push({ url: resp.url(), status: s });
  });
  const requestFailures: { url: string; error: string }[] = [];
  page.on('requestfailed', req => {
    requestFailures.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/LedgerMind/i);

  const alias = await request.get(`${apiBase()}/metrics`, { maxRedirects: 0 });
  expect(alias.status()).toBe(307);
  const loc = alias.headers()['location'];
  expect(loc).toBeTruthy();
  // Accept absolute or relative redirect target
  expect(/\/metrics$/.test(loc)).toBeTruthy();

  const failureSummary = failedResponses.map(f => `${f.status} ${f.url}`).concat(requestFailures.map(r => `FAIL ${r.error} ${r.url}`));
  expect(consoleErrors, `console errors: \n${consoleErrors.join('\n')}`).toHaveLength(0);
  expect(failedResponses, `network failures: ${failureSummary.join('\n')}`).toHaveLength(0);
});
