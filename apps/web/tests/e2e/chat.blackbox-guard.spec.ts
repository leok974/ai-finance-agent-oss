import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

test('host remains hidden when error posted', async ({ page }) => {
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'domcontentloaded' });

  const host = page.locator('lm-chatdock-host');
  await expect(host).toBeVisible(); // element exists, but opacity=0 initially

  // Force an error signal from the iframe to the host
  const iframe = await page.locator('lm-chatdock-host iframe').elementHandle();
  const frame = await iframe!.contentFrame();
  await frame!.evaluate(() => {
    parent.postMessage({ type: 'chat:error', reason: 'test' }, '*');
  });

  // Host should be hidden (opacity 0)
  await page.waitForTimeout(100);
  const opacity = await host.evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe('0');
});
