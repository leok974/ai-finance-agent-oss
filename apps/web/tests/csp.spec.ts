import { test, expect } from '@playwright/test';

test('CSP has no placeholder and no inline violations', async ({ page }) => {
  const msgs: string[] = [];
  page.on('console', m => {
    const t = m.text();
    if (t.includes('Refused to execute inline script') || t.includes('__INLINE_SCRIPT_HASHES__')) msgs.push(t);
  });
  await page.goto(process.env.BASE_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
  expect(msgs.join('\n')).not.toContain('__INLINE_SCRIPT_HASHES__');
  expect(msgs.join('\n')).not.toContain('Refused to execute inline script');
});

test('X-Config-Version header is present and resolved', async ({ page }) => {
  const resp = await page.request.fetch('/');
  expect(resp.ok()).toBeTruthy();
  // Normalize header lookup (APIResponse#headers is Record<string,string>)
  const headers = resp.headers();
  const cfg = headers['x-config-version'];
  expect(cfg, 'x-config-version header missing').toBeTruthy();
  expect(cfg).not.toContain('__CONFIG_VERSION__');
});
