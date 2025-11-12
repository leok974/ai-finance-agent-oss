import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat Panel Positioning @prod', () => {
  test('chat never clips and stays anchored within viewport', async ({ page }) => {
    // Clear any chat fuse from previous failures
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    // Navigate to app in diag mode to prevent auto-close
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Auth settle

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Find chat launcher bubble
    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });

    // Click launcher to open chat
    await bubble.click();

    // Wait for iframe to appear with opacity transition
    const iframe = page.locator('[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'attached', timeout: 5000 });

    // Wait for opacity to become 1 (fully visible)
    await expect(iframe).toHaveCSS('opacity', '1', { timeout: 3000 });

    // Get iframe bounding box
    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();

    // Get viewport dimensions
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    // Verify iframe is within viewport with proper margins (16px)
    const MARGIN = 16;
    expect(box!.x, 'left edge within margin').toBeGreaterThanOrEqual(MARGIN);
    expect(box!.y, 'top edge within margin').toBeGreaterThanOrEqual(MARGIN);
    expect(box!.x + box!.width, 'right edge within margin').toBeLessThanOrEqual(viewport.width - MARGIN);
    expect(box!.y + box!.height, 'bottom edge within margin').toBeLessThanOrEqual(viewport.height - MARGIN);
  });

  test('iframe uses opacity/pointerEvents only (never display:none)', async ({ page }) => {
    // Clear any chat fuse from previous failures
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });

    // Check iframe exists before opening
    const iframe = page.locator('[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'attached', timeout: 5000 });

    // Before opening: should have opacity 0, pointerEvents none, display NOT none
    const beforeStyles = await iframe.evaluate(el => ({
      opacity: window.getComputedStyle(el).opacity,
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      display: window.getComputedStyle(el).display,
    }));

    expect(beforeStyles.opacity, 'initial opacity is 0').toBe('0');
    expect(beforeStyles.pointerEvents, 'initial pointerEvents is none').toBe('none');
    expect(beforeStyles.display, 'display is NEVER none').not.toBe('none');

    // Open chat
    await bubble.click();
    await expect(iframe).toHaveCSS('opacity', '1', { timeout: 3000 });

    // After opening: should have opacity 1, pointerEvents auto, display still NOT none
    const afterStyles = await iframe.evaluate(el => ({
      opacity: window.getComputedStyle(el).opacity,
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      display: window.getComputedStyle(el).display,
    }));

    expect(afterStyles.opacity, 'after opacity is 1').toBe('1');
    expect(afterStyles.pointerEvents, 'after pointerEvents is auto').toBe('auto');
    expect(afterStyles.display, 'display is STILL not none').not.toBe('none');
  });

  test('chat repositions on viewport resize', async ({ page }) => {
    // Clear any chat fuse from previous failures
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });

    const iframe = page.locator('[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'attached', timeout: 5000 });

    // Open chat
    await bubble.click();
    await expect(iframe).toHaveCSS('opacity', '1', { timeout: 3000 });

    // Get initial position
    const box1 = await iframe.boundingBox();
    expect(box1).not.toBeNull();

    // Resize viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Wait for reposition

    // Get new position
    const box2 = await iframe.boundingBox();
    expect(box2).not.toBeNull();

    // Verify still within viewport bounds
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    const MARGIN = 16;
    expect(box2!.x).toBeGreaterThanOrEqual(MARGIN);
    expect(box2!.y).toBeGreaterThanOrEqual(MARGIN);
    expect(box2!.x + box2!.width).toBeLessThanOrEqual(viewport.width - MARGIN);
    expect(box2!.y + box2!.height).toBeLessThanOrEqual(viewport.height - MARGIN);
  });

  test('DevTools snapshot shows correct state', async ({ page }) => {
    // Clear any chat fuse from previous failures
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });

    const iframe = page.locator('[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'attached', timeout: 5000 });

    // Open chat
    await bubble.click();
    await expect(iframe).toHaveCSS('opacity', '1', { timeout: 3000 });

    // Call lmChat.snapshot() in console
    const snapshot = await page.evaluate(() => {
      return (window as any).lmChat?.snapshot?.();
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot.isOpen).toBe(true);
    expect(snapshot.style.op).toBe('1'); // abbreviated field name
    expect(snapshot.style.pe).toBe('auto');
    expect(snapshot.style.disp).toBe(''); // should be empty string, never 'none'
    expect(snapshot.rect).toBeDefined();
    expect(snapshot.rect.w).toBeGreaterThan(0);
    expect(snapshot.rect.h).toBeGreaterThan(0);
  });
});
