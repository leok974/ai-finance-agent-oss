import { test, expect } from '@playwright/test';

// Use saved production auth state
test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

test.describe('Chat iframe positioning', () => {
  test('chat opens at launcher without clipping', async ({ page }) => {
    // Navigate to app (should be authenticated via storageState)
    await page.goto(process.env.BASE_URL || 'http://localhost:5173');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Wait for and click chat launcher
    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 10000 });
    await bubble.click();

    // Iframe should appear
    const iframe = page.locator('iframe[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'visible', timeout: 5000 });

    // Check iframe is within viewport bounds
    const box = await iframe.boundingBox();
    expect(box).toBeTruthy();

    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);

    // Verify iframe has reasonable size
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(400);
  });

  test('chat input works and messages display', async ({ page }) => {
    await page.goto(process.env.BASE_URL || 'http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.click();

    const iframe = page.frameLocator('iframe[data-testid="lm-chat-iframe"]');

    // Find input and send button
    const input = iframe.locator('[data-testid="lm-input"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('test message');

    const sendBtn = iframe.locator('[data-testid="lm-send"]');
    await sendBtn.click();

    // Message should appear in thread
    await expect(iframe.locator('.lm-msg, .bubble')).toContainText('test message', { timeout: 3000 });
  });
});
