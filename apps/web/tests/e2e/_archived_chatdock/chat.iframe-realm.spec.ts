import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

async function getChatFrame(page: any) {
  const host = page.locator('lm-chatdock-host iframe');
  await expect(host).toHaveCount(1);
  return await host.elementHandle().then((h: any) => h?.contentFrame());
}

test('container & portal root are same-document within iframe', async ({ page }) => {
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'domcontentloaded' });

  const frame = await getChatFrame(page);
  expect(frame, 'chat iframe not found').toBeTruthy();

  const ok = await frame!.evaluate(() => {
    const d = document;
    const container = d.getElementById('chat-root');
    const portal = d.getElementById('__LM_PORTAL_ROOT__');
    if (!container || !portal) return false;
    return container.ownerDocument === d && portal.ownerDocument === d;
  });

  expect(ok).toBeTruthy();
});
