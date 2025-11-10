import { test, expect } from '@playwright/test';

test.describe('Chat Iframe Rendering', () => {
  test('chat iframe should be created and visible', async ({ page }) => {
    // Navigate to main app
    await page.goto('/');

    // Wait for app to boot
    await page.waitForFunction(() => {
      return (window as any).__APP_MOUNTED__ === true;
    }, { timeout: 10000 });

    // Wait for auth to complete (either logged in or at login screen)
    await page.waitForFunction(() => {
      const logs = (window as any).__consoleLogs || [];
      return logs.some((log: string) => log.includes('[boot] React root mounted'));
    }, { timeout: 5000 }).catch(() => {
      // If no console logs, just wait for root element
      return page.waitForSelector('#root', { timeout: 5000 });
    });

    // Wait a bit for chat mount effect to run
    await page.waitForTimeout(2000);

    // Check if custom element exists
    const chatHost = await page.locator('lm-chatdock-host').first();
    await expect(chatHost).toBeAttached({ timeout: 5000 });

    // Check if shadow root contains iframe
    const hasIframe = await chatHost.evaluate((el) => {
      const shadow = el.shadowRoot;
      if (!shadow) return false;
      const iframe = shadow.querySelector('#lm-chat-frame');
      return !!iframe;
    });

    expect(hasIframe).toBe(true);

    // Get iframe element for further checks
    const iframe = await chatHost.evaluateHandle((el) => {
      return el.shadowRoot?.querySelector('#lm-chat-frame');
    });

    // Check iframe src points to /chat/
    const iframeSrc = await iframe.evaluate((el: any) => el?.src);
    expect(iframeSrc).toContain('/chat/');

    // Check iframe sandbox attribute (should allow scripts but not same-origin)
    const iframeSandbox = await iframe.evaluate((el: any) => el?.getAttribute('sandbox'));
    expect(iframeSandbox).toBe('allow-scripts allow-popups');
  });

  test('chat iframe should load without CSP errors', async ({ page }) => {
    const cspErrors: string[] = [];

    // Listen for CSP violations
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Refused to frame') || text.includes('CSP')) {
        cspErrors.push(text);
      }
    });

    await page.goto('/');

    // Wait for app boot
    await page.waitForTimeout(3000);

    // Check that no CSP frame-ancestors errors occurred
    const frameErrors = cspErrors.filter(e =>
      e.includes('frame-ancestors') || e.includes('Refused to frame')
    );

    expect(frameErrors).toHaveLength(0);
  });

  test('chat mount flags should be correct', async ({ page }) => {
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[App]')) {
        consoleLogs.push(text);
      }
    });

    await page.goto('/');

    // Wait for logs
    await page.waitForTimeout(2000);

    // Should see chat enabled logs
    const chatFlagLog = consoleLogs.find(log => log.includes('CHAT_FLAG'));
    const chatEnabledLog = consoleLogs.find(log => log.includes('chatEnabled'));

    console.log('Chat flag logs:', consoleLogs.filter(l => l.includes('CHAT')));

    // Verify chatEnabled is true (assuming no session fuse is set)
    expect(consoleLogs.some(log =>
      log.includes('chatEnabled = true') ||
      log.includes('chatEnabled: true')
    )).toBe(true);
  });

  test('chat iframe should post ready message', async ({ page }) => {
    const messages: any[] = [];

    // Listen for postMessage events
    await page.exposeFunction('captureMessage', (msg: any) => {
      messages.push(msg);
    });

    await page.addInitScript(() => {
      window.addEventListener('message', (e) => {
        (window as any).captureMessage(e.data);
      });
    });

    await page.goto('/');

    // Wait for chat to mount and iframe to load
    await page.waitForTimeout(5000);

    // Check for chat:ready message
    const readyMessage = messages.find(m => m?.type === 'chat:ready');

    if (!readyMessage) {
      console.log('All messages:', messages);
    }

    expect(readyMessage).toBeDefined();
    expect(readyMessage.type).toBe('chat:ready');
  });

  test('chat host should reveal on ready message', async ({ page }) => {
    await page.goto('/');

    // Wait for chat host to exist
    const chatHost = await page.locator('lm-chatdock-host').first();
    await expect(chatHost).toBeAttached({ timeout: 5000 });

    // Wait for ready message (host should get 'ready' class)
    await page.waitForFunction(() => {
      const host = document.querySelector('lm-chatdock-host');
      return host?.classList.contains('ready');
    }, { timeout: 10000 });

    // Verify host has ready class
    const hasReady = await chatHost.evaluate((el) => el.classList.contains('ready'));
    expect(hasReady).toBe(true);

    // Verify host is visible (opacity should be 1 when ready)
    const opacity = await chatHost.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });

    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });
});
