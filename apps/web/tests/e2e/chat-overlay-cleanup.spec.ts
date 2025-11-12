/**
 * E2E tests for chat overlay cleanup and reopen functionality
 * These tests verify the exact regressions mentioned in the user's patches
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

// Use production auth state for tests that need authentication
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

test.describe('Chat Overlay Cleanup @prod', () => {
  test('overlay removed on close and reopen works', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });

    // Wait for auth to settle
    await page.waitForTimeout(2000);

    // Check if authenticated (not redirected to login)
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Wait for launcher to be visible
    const launcher = page.locator('[data-testid="lm-chat-bubble"]');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });

    // Open chat
    await launcher.click();

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150); // Wait for rAF + transition

    // Verify iframe is visible (opacity check)
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Verify overlay exists while open
    const overlay = page.locator('[data-testid="lm-chat-overlay"]');
    await expect(overlay).toHaveCount(1);

    // Close chat via API to avoid racy outside clicks
    await page.evaluate(() => (window as any).lmChat.close());

    // Wait for iframe to be hidden (opacity animation)
    await page.waitForTimeout(150);
    const closedOpacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(closedOpacity).toBe('0');

    // Overlay should be completely removed from DOM
    await expect(overlay).toHaveCount(0);

    // Reopen should work - launcher should be clickable again
    await launcher.click();
    await page.waitForTimeout(150);

    // Verify iframe is actually visible (opacity=1, not display:none)
    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.style.opacity).toBe('1');
    expect(snapshot.style.display).toBe('');
    expect(snapshot.overlay).toBe(true);
  });

  test('iframe visibility gating uses opacity/pointerEvents only (never display:none)', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150); // Wait for transition

    // Verify display is NEVER 'none' - should be empty string
    const display = await iframe.evaluate(e => (e as HTMLElement).style.display);
    expect(display).toBe('');

    // Verify opacity gates
    const opacity = await iframe.evaluate(e => (e as HTMLElement).style.opacity);
    expect(opacity).toBe('1');

    // Verify pointer-events gates
    const pointerEvents = await iframe.evaluate(e => (e as HTMLElement).style.pointerEvents);
    expect(pointerEvents).toBe('auto');
  });

  test('DIAG mode prevents ESC close', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait a bit for any potential close animation
    await page.waitForTimeout(200);

    // Chat should still be open in DIAG mode (opacity still 1)
    const opacityAfter = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBeGreaterThanOrEqual(0.99);

    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.isOpen).toBe(true);
  });

  test('DEBUG mode prevents ESC close', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=debug`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait a bit for any potential close animation
    await page.waitForTimeout(200);

    // Chat should still be open in DEBUG mode
    const opacityAfter = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBeGreaterThanOrEqual(0.99);

    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.isOpen).toBe(true);
  });

  test('normal mode allows ESC close', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Wait for arming
    await page.waitForTimeout(40);

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait for close animation
    await page.waitForTimeout(150);

    // Chat should be closed (opacity 0)
    const closedOpacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(closedOpacity).toBe('0');

    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.isOpen).toBe(false);
    expect(snapshot.overlay).toBe(false);
  });

  test('overlay click closes chat in normal mode', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Wait for arming (requestAnimationFrame delay)
    await page.waitForTimeout(40);

    // Click overlay
    const overlay = page.locator('[data-testid="lm-chat-overlay"]');
    await overlay.click({ position: { x: 10, y: 10 }, force: true });

    // Wait for close animation
    await page.waitForTimeout(150);

    // Chat should be closed (opacity 0)
    const closedOpacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(closedOpacity).toBe('0');

    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.isOpen).toBe(false);
  });

  test('overlay click does NOT close in DIAG mode', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Wait for arming
    await page.waitForTimeout(40);

    // Click overlay
    const overlay = page.locator('[data-testid="lm-chat-overlay"]');
    await overlay.click({ position: { x: 10, y: 10 }, force: true });

    // Wait to ensure no close happens
    await page.waitForTimeout(200);

    // Chat should still be open (opacity still 1)
    const opacityAfter = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBeGreaterThanOrEqual(0.99);

    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());
    expect(snapshot.isOpen).toBe(true);
  });

  test('DevTools snapshot shows correct state', async ({ page }) => {
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });

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

    const iframe = page.locator('#lm-chat-iframe');
    await page.waitForTimeout(150);

    // Verify visible
    const opacity = await iframe.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.99);

    // Get snapshot
    const snapshot = await page.evaluate(() => (window as any).lmChat.snapshot());

    // Verify structure
    expect(snapshot).toHaveProperty('isOpen', true);
    expect(snapshot).toHaveProperty('armedOutside', true);
    expect(snapshot).toHaveProperty('DIAG', true);
    expect(snapshot).toHaveProperty('overlay', true);
    expect(snapshot.style).toHaveProperty('opacity', '1');
    expect(snapshot.style).toHaveProperty('pe', 'auto');
    expect(snapshot.style).toHaveProperty('display', '');
    expect(snapshot.style).toHaveProperty('vis', '');
  });
});
