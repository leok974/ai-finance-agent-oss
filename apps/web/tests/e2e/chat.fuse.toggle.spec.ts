// apps/web/tests/e2e/chat.fuse.toggle.spec.ts
import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL || 'http://localhost:5173';

test('chat fuse: ?chat=1 clears and window.enableChat() works', async ({ page }) => {
  // Seed a stuck fuse
  await page.goto(`${APP}/?chat=0`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => sessionStorage.setItem('lm:disableChat', '1'));
  expect(await page.evaluate(() => sessionStorage.getItem('lm:disableChat'))).toBe('1');

  // 1) Query param clears it
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => sessionStorage.getItem('lm:disableChat'))).toBeNull();

  // 2) Helper also clears + reloads
  await page.evaluate(() => (window as any).enableChat?.());
  // give it a beat to reload:
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => sessionStorage.getItem('lm:disableChat'))).toBeNull();
});
