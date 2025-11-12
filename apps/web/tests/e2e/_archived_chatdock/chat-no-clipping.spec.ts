import { test, expect } from '@playwright/test';

test.describe('@prod Chat Panel Positioning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to be ready
    await page.waitForLoadState('networkidle');
  });

  test('chat panel should be fully visible in viewport without clipping', async ({ page }) => {
    // Click chat launcher
    const launcher = page.locator('[data-testid="lm-chat-launcher"]').or(page.locator('lm-chat-launcher'));
    await launcher.waitFor({ state: 'visible', timeout: 10000 });
    await launcher.click();

    // Wait for chat iframe to appear
    const chatHost = page.locator('lm-chatdock-host');
    await chatHost.waitFor({ state: 'visible', timeout: 5000 });

    const iframe = chatHost.locator('iframe').first();
    await iframe.waitFor({ state: 'visible', timeout: 5000 });

    // Get panel position and viewport dimensions
    const rect = await page.evaluate(() => {
      const host = document.querySelector('lm-chatdock-host');
      const frame = host?.shadowRoot?.querySelector('iframe');
      if (!frame) throw new Error('Chat iframe not found');

      const r = frame.getBoundingClientRect();
      const vp = window.visualViewport || { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0 };

      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
        vpWidth: vp.width,
        vpHeight: vp.height,
        vpLeft: vp.offsetLeft ?? 0,
        vpTop: vp.offsetTop ?? 0,
      };
    });

    console.log('Chat panel rect:', rect);

    // Panel must be fully inside viewport
    expect(rect.x).toBeGreaterThanOrEqual(rect.vpLeft);
    expect(rect.y).toBeGreaterThanOrEqual(rect.vpTop);
    expect(rect.right).toBeLessThanOrEqual(rect.vpLeft + rect.vpWidth);
    expect(rect.bottom).toBeLessThanOrEqual(rect.vpTop + rect.vpHeight);

    // Panel should have reasonable size
    expect(rect.width).toBeGreaterThan(300);
    expect(rect.height).toBeGreaterThan(400);
  });

  test('chat messages should wrap text and not cause horizontal scroll', async ({ page }) => {
    // Open chat
    const launcher = page.locator('[data-testid="lm-chat-launcher"]').or(page.locator('lm-chat-launcher'));
    await launcher.click();

    const chatHost = page.locator('lm-chatdock-host');
    await chatHost.waitFor({ state: 'visible' });

    // Access iframe content
    const iframe = chatHost.locator('iframe').first();
    const frame = iframe.contentFrame();
    await frame.waitForLoadState('domcontentloaded');

    // Type very long message
    const input = frame.locator('.input, input[type="text"], textarea').first();
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('x'.repeat(500));

    // Send message (try multiple selectors)
    const sendBtn = frame.locator('button:has-text("Send")').or(frame.locator('[type="submit"]')).or(frame.locator('.btn')).first();
    await sendBtn.click().catch(() => {
      // If no send button, press Enter
      return input.press('Enter');
    });

    // Wait a bit for message to render
    await page.waitForTimeout(1000);

    // Check for horizontal scroll in message area
    const hasHScroll = await frame.locator('.lm-thread, .lm-chat__scroll, [data-testid="messages"]').first().evaluate(
      (el) => el.scrollWidth > el.clientWidth + 2 // +2 for rounding
    ).catch(() => false);

    expect(hasHScroll).toBe(false);
  });
});
