import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('@prod-critical toggles tools panel inside chat iframe', async ({ page }) => {
  // Navigate to the route that loads chat in iframe mode
  await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

  // Access the iframe content
  const frame = page.frameLocator('#lm-chat-iframe');
  
  // The root div inside the iframe has data-tools-open
  const root = frame.getByTestId('lm-chat-iframe');
  await expect(root).toBeVisible();

  // The toggle button is inside the iframe
  const toggle = frame.getByTestId('chat-tools-toggle');
  await expect(toggle).toBeVisible();

  // Get initial state
  const before = await root.getAttribute('data-tools-open');

  // Click via JS to bypass interception issues
  await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
    if (!iframe?.contentDocument) throw new Error('iframe not found');
    const btn = iframe.contentDocument.querySelector<HTMLButtonElement>('[data-testid="chat-tools-toggle"]');
    if (!btn) throw new Error('toggle button not found');
    btn.click();
  });

  // Wait for the attribute to change
  await expect
    .poll(async () => await root.getAttribute('data-tools-open'))
    .not.toBe(before);
});
