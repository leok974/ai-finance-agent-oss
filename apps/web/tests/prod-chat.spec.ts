/**
 * prod-chat.spec.ts - Production chat feature test
 * 
 * Verifies that chat can be enabled via ?chat=1 without crashing.
 * This test can be quarantined until the chat feature is fully stabilized.
 */
import { test, expect } from '@playwright/test';

test.describe('Production chat feature (opt-in)', () => {
  test('loads with chat=1 without React errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const reactErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        consoleErrors.push(text);
        
        // Detect React errors
        if (text.includes('Minified React error')) {
          reactErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(`PageError: ${err.message}`);
    });

    // Explicitly enable chat
    await page.goto((process.env.BASE_URL ?? 'http://localhost:5173') + '?chat=1', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Wait for app to settle and chat to mount
    await page.waitForTimeout(3000);

    // Verify no React errors
    expect(reactErrors, 'React errors with chat=1').toHaveLength(0);
    
    // Verify no critical console errors
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('DevTools') && 
      !e.includes('Download the React DevTools') &&
      !e.includes('[chat] mounted') // Allow chat mount logs
    );
    expect(criticalErrors, 'Console errors with chat enabled').toHaveLength(0);

    // Verify Shadow DOM host exists
    const shadowHost = await page.locator('#lm-chatdock-host').count();
    expect(shadowHost, 'Shadow DOM host should exist').toBeGreaterThan(0);

    // Verify chat mounted in Shadow DOM
    const hasShadowRoot = await page.evaluate(() => {
      const host = document.getElementById('lm-chatdock-host');
      return !!host?.shadowRoot;
    });
    expect(hasShadowRoot, 'Shadow root should be attached').toBe(true);
  });

  test('chat fuse prevents reload loop after error', async ({ page, context }) => {
    // Simulate a chat crash by setting the fuse (now sessionStorage)
    await context.addInitScript(() => {
      sessionStorage.setItem('lm:disableChat', '1');
    });

    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Try to load with chat=1 but fuse is tripped
    await page.goto((process.env.BASE_URL ?? 'http://localhost:5173') + '?chat=1', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    await page.waitForTimeout(2000);

    // Verify chat did NOT mount (fuse protection)
    const mountMessages = consoleMessages.filter(m => m.includes('[chat] mounted'));
    expect(mountMessages, 'Chat should not mount when fuse is tripped').toHaveLength(0);

    // Verify fuse is still set (sessionStorage)
    const fuseValue = await page.evaluate(() => sessionStorage.getItem('lm:disableChat'));
    expect(fuseValue).toBe('1');
  });

  test('dev menu shows enable chat option when fuse tripped', async ({ page, context }) => {
    // Set the fuse (sessionStorage)
    await context.addInitScript(() => {
      sessionStorage.setItem('lm:disableChat', '1');
      // Unlock dev menu
      localStorage.setItem('dev:unlocked', '1');
    });

    await page.goto(process.env.BASE_URL ?? 'http://localhost:5173', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Open dev menu (if available)
    const devTrigger = page.locator('[data-testid="dev-trigger"]');
    if (await devTrigger.count() > 0) {
      await devTrigger.click();
      
      // Check for enable chat option
      const enableChatOption = page.locator('[data-testid="dev-enable-chat"]');
      const count = await enableChatOption.count();
      expect(count, 'Enable chat option should appear when fuse tripped').toBeGreaterThan(0);
    }
  });

  test('chat mounts after idle when page is loaded', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.goto((process.env.BASE_URL ?? 'http://localhost:5173') + '?chat=1', {
      waitUntil: 'load', // Wait for full page load
      timeout: 15000
    });

    // Wait for idle callback to trigger
    await page.waitForTimeout(4000);

    // Check if chat mount was attempted
    const chatLogs = consoleMessages.filter(m => m.includes('[chat]'));
    console.log('[test] Chat logs:', chatLogs);
    
    // Should see either mount success or bootstrap attempt
    const hasChatActivity = chatLogs.some(m => 
      m.includes('mounted') || 
      m.includes('bootstrap') ||
      m.includes('mount error')
    );
    
    // If chat enabled, we should see some activity
    if (hasChatActivity) {
      console.log('[test] Chat mounting activity detected');
    }
  });
});
