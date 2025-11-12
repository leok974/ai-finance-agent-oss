/**
 * Chat diagnostic mode tests
 *
 * Tests the ?chat=diag and ?chat=debug modes that prevent auto-close
 * and the arming delay that prevents same-click close
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

// Use saved auth state for prod tests
test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

test.describe('Chat Diagnostic Mode @prod', () => {
  test('chat opens with ?chat=diag, remains visible, input works', async ({ page }) => {
    await page.goto(BASE_URL + '/?chat=diag', { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated (not redirected to login)
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Click launcher
    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();

    // Chat iframe should become visible (opacity gate, not visibility)
    const chatIframe = page.locator('iframe#lm-chat-iframe');
    await page.waitForTimeout(150); // Wait for rAF + transition (120ms + buffer)

    // Check opacity is set to 1 (visible)
    const opacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99); // Allow for float precision

    // Frame locator for iframe content
    const frame = page.frameLocator('iframe#lm-chat-iframe');

    // Interact with input (Playwright sees opacity elements as "hidden", use force)
    const input = frame.locator('.lm-composer input').first();
    await input.fill('hi', { timeout: 5000 });

    // Send button
    const sendBtn = frame.locator('.lm-composer button[type="submit"]').first();
    await sendBtn.click();

    // Message should appear (wait longer for API response)
    await page.waitForTimeout(1000); // Wait for message to be sent
    const hasMessage = await frame.locator('text=hi').first().count();
    expect(hasMessage).toBeGreaterThan(0);

    // CRITICAL: In diag mode, clicking overlay should NOT close chat
    const overlay = page.locator('#lm-overlay').first(); // Use .first() in case of duplicates
    await overlay.click({ position: { x: 10, y: 10 }, force: true }); // Click overlay (bypass iframe intercept)

    // Chat should still be visible (diag mode prevents close)
    await expect(chatIframe).toBeVisible();
  });

  test('chat opens with ?chat=debug, never auto-closes', async ({ page }) => {
    await page.goto(BASE_URL + '/?chat=debug', { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();

    const chatIframe = page.locator('iframe#lm-chat-iframe');
    await page.waitForTimeout(150); // Wait for rAF + transition

    // Check opacity is set to 1 (visible)
    const opacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Try to close by clicking overlay multiple times
    const overlay = page.locator('#lm-overlay').first();
    await overlay.click({ position: { x: 10, y: 10 }, force: true });
    await page.waitForTimeout(100);
    await overlay.click({ position: { x: 20, y: 20 }, force: true });

    // Should still be visible (opacity should remain 1, debug mode prevents close)
    const opacityAfter = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBeGreaterThanOrEqual(0.99);    // Try Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Should STILL be visible (opacity check - debug mode prevents ALL auto-close)
    const opacityAfterEsc = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfterEsc)).toBeGreaterThanOrEqual(0.99);
  });
});

test.describe('Chat Arming Behavior', () => {
  test('overlay click closes only after arming delay', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });

    // Open chat
    await launcher.click();

    const chatIframe = page.locator('iframe#lm-chat-iframe');
    await page.waitForTimeout(150); // Wait for opacity transition

    // Verify chat is visible
    const opacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Immediately click overlay (should be ignored - not armed yet)
    const overlay = page.locator('#lm-overlay').first();
    await overlay.click({ position: { x: 10, y: 10 }, timeout: 100, force: true });

    // Chat should still be visible (arming delay prevents immediate close)
    const opacityAfterClick = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(opacityAfterClick).toBe('1');

    // Wait for arming to complete (one more frame ~16ms + buffer)
    await page.waitForTimeout(40);

    // Now clicking overlay should close
    await overlay.click({ position: { x: 10, y: 10 }, force: true });

    // Chat should be hidden (opacity 0)
    await page.waitForTimeout(150); // Wait for transition
    const finalOpacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(finalOpacity).toBe('0');
  });

  test('escape key closes only after arming', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();

    const chatIframe = page.locator('iframe#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Immediately press Escape (should be ignored - not armed)
    await page.keyboard.press('Escape');

    // Chat should still be visible
    const opacityAfterEsc = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(opacityAfterEsc).toBe('1');

    // Wait for arming
    await page.waitForTimeout(40);

    // Now Escape should close
    await page.keyboard.press('Escape');

    // Chat should be hidden
    await page.waitForTimeout(150);
    const finalOpacity = await chatIframe.evaluate(el => getComputedStyle(el).opacity);
    expect(finalOpacity).toBe('0');
  });
});

test.describe('DevTools Diagnostics', () => {
  test('window.lmChat exposes diagnostic state', async ({ page }) => {
    await page.goto(BASE_URL + '/?chat=diag', { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();

    await page.waitForTimeout(100); // Let chat open and arm

    // Check window.lmChat.state exists
    const hasState = await page.evaluate(() => {
      return typeof (window as any).lmChat?.state === 'object';
    });
    expect(hasState).toBe(true);

    // Check snapshot function exists
    const hasSnapshot = await page.evaluate(() => {
      return typeof (window as any).lmChat?.snapshot === 'function';
    });
    expect(hasSnapshot).toBe(true);

    // Check force function exists
    const hasForce = await page.evaluate(() => {
      return typeof (window as any).lmChat?.force === 'function';
    });
    expect(hasForce).toBe(true);

    // Call snapshot and verify structure
    const snapshot = await page.evaluate(() => {
      return (window as any).lmChat.snapshot();
    });

    expect(snapshot).toHaveProperty('armedOutside');
    expect(snapshot).toHaveProperty('isOpen');
    expect(snapshot).toHaveProperty('DIAG');
    expect(snapshot).toHaveProperty('overlay');
    expect(snapshot).toHaveProperty('ifr');
    expect(snapshot).toHaveProperty('ifrZ');
    expect(snapshot).toHaveProperty('style');
    expect(snapshot).toHaveProperty('rect');
    expect(snapshot).toHaveProperty('vp');

    // Verify values make sense
    expect(snapshot.isOpen).toBe(true);
    expect(snapshot.DIAG).toBe(true);
    expect(snapshot.overlay).toBe(true);
    expect(snapshot.ifr).toBe(true);
    expect(snapshot.ifrZ).toBe('2147483646');

    // Check style properties
    expect(snapshot.style).toHaveProperty('opacity');
    expect(snapshot.style).toHaveProperty('pe'); // pointerEvents
    expect(snapshot.style.opacity).toBe('1');
    expect(snapshot.style.pe).toBe('auto');

    expect(snapshot.rect.w).toBeGreaterThan(100);
    expect(snapshot.rect.h).toBeGreaterThan(100);
  });
});
