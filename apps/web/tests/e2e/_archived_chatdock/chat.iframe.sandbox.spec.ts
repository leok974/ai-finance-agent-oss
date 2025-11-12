// apps/web/tests/e2e/chat.iframe.sandbox.spec.ts
import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL || 'http://localhost:5173';

test('chat iframe: sandbox flags and src are correct', async ({ page }) => {
  await page.goto(`${APP}/?chat=1`, { waitUntil: 'networkidle' });

  // Find the custom element host, then the iframe inside its shadow root
  const host = page.locator('lm-chatdock-host');
  await expect(host).toHaveCount(1);

  // Host should eventually reveal (ready) then remain visible
  await expect(host).toHaveJSProperty('className', /ready/);

  // Resolve the iframe element under shadowRoot via JS
  const iframe = await host.evaluateHandle((el: HTMLElement) =>
    (el.shadowRoot?.querySelector('iframe') as HTMLIFrameElement) || null
  );
  expect(iframe).not.toBeNull();

  // Check sandbox flags
  const sandbox = await iframe.evaluate((f: HTMLIFrameElement) => f.getAttribute('sandbox'));
  expect(sandbox).toBeTruthy();
  // We currently expect allow-same-origin so assets load
  expect(sandbox).toContain('allow-scripts');
  expect(sandbox).toContain('allow-popups');
  expect(sandbox).toContain('allow-same-origin');

  // Check src (we're not using srcdoc anymore)
  const src = await iframe.evaluate((f: HTMLIFrameElement) => f.getAttribute('src'));
  expect(src).toBe('/chat/index.html');
});
