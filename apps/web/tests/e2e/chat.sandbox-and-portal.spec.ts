import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

async function getChatFrameHandle(page: any) {
  const fr = page.locator('lm-chatdock-host iframe');
  await expect(fr).toHaveCount(1);
  return fr.first();
}

test('iframe sandbox flags and portal target ownership', async ({ page }) => {
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'domcontentloaded' });

  const iframeHandle = await getChatFrameHandle(page);
  const sandbox = await iframeHandle.getAttribute('sandbox');
  expect(sandbox).toBeTruthy();
  // Current config uses allow-scripts allow-popups allow-same-origin
  expect(sandbox!).toMatch(/allow-scripts/);
  expect(sandbox!).toMatch(/allow-popups/);
  expect(sandbox!).toMatch(/allow-same-origin/);

  // Inside iframe, ensure portal root exists and is in same doc
  const frame = await (await iframeHandle.elementHandle())!.contentFrame();
  const ok = await frame!.evaluate(() => {
    const d = document;
    const pr = d.getElementById('__LM_PORTAL_ROOT__');
    return !!pr && pr.ownerDocument === d;
  });
  expect(ok).toBeTruthy();
});
