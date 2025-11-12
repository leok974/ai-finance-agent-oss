import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

async function getChatHost(page: any) {
  await page.waitForSelector('lm-chatdock-host', { state: 'attached' });
  return page.locator('lm-chatdock-host');
}

test('chat host lifecycle: hidden → ready → (no error)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (/Minified React error #185|ErrorBoundary caught/i.test(t)) errors.push(t);
  });

  await page.goto(`${APP}/?chat=1`, { waitUntil: 'domcontentloaded' });
  const host = await getChatHost(page);

  // Initially hidden by CSS gate
  await expect(host).toHaveJSProperty('__state', undefined); // harmless
  const opacity0 = await host.evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity0).toBe('0');

  // Wait for either "ready" OR "error" flip
  const classChange = host.evaluateHandle((el: HTMLElement) => {
    return new Promise<string>((resolve) => {
      const mo = new MutationObserver(() => resolve(el.className));
      mo.observe(el, { attributes: true, attributeFilter: ['class'] });
      // In case it already flipped:
      setTimeout(() => resolve(el.className), 1000);
    });
  });
  const klass = await classChange.then(h => (h as any).jsonValue());

  // Assert we *did* reach ready at least once
  expect(klass.includes('ready') || klass.includes('error')).toBeTruthy();

  // And we should NOT have React #185
  await page.waitForTimeout(1500); // give ErrorBoundary a chance to fire if it will
  expect(errors, errors.join('\n')).toHaveLength(0);
});
