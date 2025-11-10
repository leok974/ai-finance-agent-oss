/**
 * prod-no-chat.spec.ts - Production stability test (chat disabled by default)
 * 
 * Verifies that the dashboard loads without errors when chat is disabled.
 * This is the stable baseline configuration for production.
 */
import { test, expect } from '@playwright/test';

test.describe('Production stability (no chat)', () => {
  test('loads plain dashboard without chat and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const reactErrors: string[] = [];
    
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        consoleErrors.push(text);
        
        // Detect React errors (especially minified error #185 = hydration mismatch)
        if (text.includes('Minified React error #185')) {
          reactErrors.push(text);
        }
      }
    });

    // Capture page errors
    page.on('pageerror', err => {
      consoleErrors.push(`PageError: ${err.message}`);
    });

    // Load plain root (no query params, chat should be disabled by env)
    await page.goto(process.env.BASE_URL ?? 'http://localhost:5173', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Wait for main app to render
    await page.waitForSelector('[data-testid="month-picker"]', { timeout: 5000 }).catch(() => {
      // Month picker might not exist if no data, that's ok
    });

    // Verify no React hydration errors
    expect(reactErrors, 'React hydration errors detected').toHaveLength(0);
    
    // Verify no critical console errors (allow warnings)
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('DevTools') && 
      !e.includes('Download the React DevTools')
    );
    expect(criticalErrors, 'Console errors detected').toHaveLength(0);

    // Verify dashboard loaded (check for header brand)
    const brand = await page.locator('[data-testid="brand"]').count();
    expect(brand).toBeGreaterThan(0);
  });

  test('loads with chat=0 query param and remains stable', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(`PageError: ${err.message}`);
    });

    // Explicit chat=0 parameter
    await page.goto((process.env.BASE_URL ?? 'http://localhost:5173') + '?chat=0', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    await page.waitForTimeout(2000); // Allow any deferred rendering

    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('DevTools') && 
      !e.includes('Download the React DevTools')
    );
    expect(criticalErrors, 'Console errors with chat=0').toHaveLength(0);
  });

  test('prefetch works when chat is disabled', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // chat=0 with prefetch enabled (default)
    await page.goto((process.env.BASE_URL ?? 'http://localhost:5173') + '?chat=0&prefetch=1', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    await page.waitForTimeout(2000);

    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('DevTools') && 
      !e.includes('Download the React DevTools')
    );
    expect(criticalErrors, 'Console errors with prefetch').toHaveLength(0);
  });
});
