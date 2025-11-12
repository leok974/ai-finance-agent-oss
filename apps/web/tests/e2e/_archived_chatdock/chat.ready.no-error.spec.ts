// apps/web/tests/e2e/chat.ready.no-error.spec.ts
import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL || 'http://localhost:5173';
const BAD_PATTERNS = [
  /Minified React error #185/i,
  /ErrorBoundary caught/i,
  /postMessage.*chat:error/i,
];

test('chat ready-state: host reveals and stays visible; no React #185', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || BAD_PATTERNS.some(r => r.test(text))) {
      errors.push(`[${msg.type()}] ${text}`);
    }
  });

  await page.goto(`${APP}/?chat=1`, { waitUntil: 'networkidle' });

  const host = page.locator('lm-chatdock-host');
  await expect(host).toHaveCount(1);

  // Expect host becomes ready (revealed)
  await expect.poll(async () => await host.evaluate(el => el.classList.contains('ready')), {
    message: 'chat host should become .ready',
    intervals: [200, 300, 500],
    timeout: 5000,
  }).toBeTruthy();

  // Now ensure it doesn't flip back to hidden (e.g., after chat:error)
  await page.waitForTimeout(1500);
  const isHidden = await host.evaluate((el: HTMLElement) => el.classList.contains('hidden') || el.hasAttribute('hidden'));
  expect(isHidden).toBeFalsy();

  // Fail fast if we saw any React #185 / ErrorBoundary / chat:error
  expect.soft(errors, `Unexpected console errors:\n${errors.join('\n')}`).toEqual([]);

  // Bonus assertion: iframe posted chat:ready (parent logs contain it in your app)
  const sawReady = await page.evaluate(() =>
    (window as any).__CHAT_READY_SEEN__ === true || false
  ).catch(() => false);
  // Don't fail if app doesn't expose this flag; the visible host already proves success
  expect.soft(sawReady).toBeTruthy();
});
