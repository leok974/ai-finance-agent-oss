import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('CSP has no placeholder; enforces hash coverage when inline scripts exist', async ({ request, page }) => {
  const res = await request.get(BASE);
  expect(res.ok()).toBeTruthy();

  const csp = res.headers()['content-security-policy'] || '';
  expect(csp.length).toBeGreaterThan(0);
  expect(csp.includes('__INLINE_SCRIPT_HASHES__')).toBeFalsy();

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const inlineCount = await page.evaluate(() =>
    Array.from(document.scripts).filter(s => !s.src && s.textContent?.trim().length).length
  );

  // Extract script-src directive tokens
  const scriptSrcMatch = csp.match(/\bscript-src\s+([^;]+)/);
  expect(scriptSrcMatch).toBeTruthy();
  const scriptSrcTokens = (scriptSrcMatch?.[1] || '')
    .split(/\s+/)
    .filter(Boolean);

  const hashTokens = scriptSrcTokens.filter(t => t.startsWith("'sha256-"));

  if (inlineCount === 0) {
    // No inline scripts => no hash requirements (we prefer zero hashes for tighter surface)
    expect(hashTokens.length).toBe(0);
  } else {
    // For each inline script we expect a corresponding hash (minimum 1:1). Slightly lenient allowing extra (e.g., dead inline removed later) but not fewer.
    expect(hashTokens.length).toBeGreaterThanOrEqual(inlineCount);
  }

  // Never allow unsafe-inline
  expect(scriptSrcTokens.includes("'unsafe-inline'")) .toBeFalsy();
});
