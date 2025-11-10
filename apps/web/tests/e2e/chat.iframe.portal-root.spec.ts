// apps/web/tests/e2e/chat.iframe.portal-root.spec.ts
import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL || 'http://localhost:5173';

test('chat iframe has its own #__LM_PORTAL_ROOT__', async ({ page }) => {
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'networkidle' });

  const host = page.locator('lm-chatdock-host');
  await expect(host).toHaveCount(1);

  // Get a Frame handle from the <iframe> in the shadow root
  const frame = await (async () => {
    const handle = await host.evaluateHandle((el: HTMLElement) => el.shadowRoot?.querySelector('iframe'));
    const iframe = handle.asElement();
    expect(iframe).not.toBeNull();
    return await iframe!.contentFrame();
  })();
  expect(frame).not.toBeNull();

  // The iframe document should have both the mount and portal root
  await expect(frame!.locator('#chat-root')).toHaveCount(1);
  await expect(frame!.locator('#__LM_PORTAL_ROOT__')).toHaveCount(1);
});
