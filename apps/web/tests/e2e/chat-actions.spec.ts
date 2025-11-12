/**
 * chat-actions.spec.ts - E2E tests for chat message/tool functionality
 *
 * Validates that the parent↔iframe handshake works and chat can call backend APIs.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat Actions @prod', () => {
  test('chat responds to a user message', async ({ page }) => {
    // Monitor network requests BEFORE opening chat
    const chatRequests: any[] = [];
    page.on('request', req => {
      if (req.url().includes('/agent/chat')) {
        chatRequests.push({ url: req.url(), method: req.method(), postData: req.postDataJSON() });
      }
    });

    // Enable test mode for deterministic responses
    await page.addInitScript(() => {
      (window as any).__E2E_TEST__ = true;
    });

    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Wait for chat readiness (eliminates race conditions)
    await page.evaluate(() => (window as any).frames[0]?.lmChatReady);

    // Wait for chat input to be ready
    const input = iframe.getByPlaceholder(/Ask or type a command/i);
    await expect(input).toBeVisible({ timeout: 5000 });

    // Type a message and submit
    await input.fill('ping');
    await page.keyboard.press('Enter');

    // Wait for the request to be made
    await expect.poll(() => chatRequests.length > 0, {
      timeout: 5000,
      message: 'Expected chat message to trigger /agent/chat API call'
    }).toBeTruthy();

    // Verify request structure
    expect(chatRequests[0].method).toBe('POST');
    expect(chatRequests[0].postData).toHaveProperty('messages');
    expect(chatRequests[0].postData.messages[0]).toHaveProperty('content', 'ping');
  });

  test('tool button sends correct API request', async ({ page }) => {
    // Monitor network requests BEFORE opening chat
    const toolRequests: any[] = [];
    page.on('request', req => {
      if (req.url().includes('/agent/chat')) {
        toolRequests.push({ url: req.url(), method: req.method(), postData: req.postDataJSON() });
      }
    });

    // Enable test mode
    await page.addInitScript(() => {
      (window as any).__E2E_TEST__ = true;
    });

    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Wait for chat readiness
    await page.evaluate(() => (window as any).frames[0]?.lmChatReady);

    // Click a tool button
    const toolButton = iframe.getByRole('button', { name: /Month summary/i });
    await toolButton.click();

    // Wait for the request to be made
    await expect.poll(() => toolRequests.length > 0, {
      timeout: 3000,
      message: 'Expected tool button to trigger /agent/chat API call'
    }).toBeTruthy();

    // Verify request structure
    expect(toolRequests[0].method).toBe('POST');
    expect(toolRequests[0].postData).toHaveProperty('messages');
    expect(toolRequests[0].postData).toHaveProperty('mode', 'charts.month_summary');
  });

  test('INIT config is received by iframe', async ({ page }) => {
    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to load
    await page.waitForTimeout(1000);

    // Check INIT config in iframe context
    const initConfig = await page.evaluate(() => {
      const iframe = document.querySelector('[data-testid="lm-chat-iframe"]') as HTMLIFrameElement;
      if (!iframe?.contentWindow) return null;
      return (iframe.contentWindow as any).INIT;
    });

    expect(initConfig).toBeTruthy();
    expect(initConfig).toHaveProperty('apiBase');
    expect(initConfig).toHaveProperty('baseUrl');
    expect(initConfig.apiBase).toBe('/api');
  });

  test('LLM badge shows health status', async ({ page }) => {
    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Check for LLM badge (should show OK or error state)
    const badge = iframe.locator('.badge').filter({ hasText: /LLM:/i });
    await expect(badge).toBeVisible({ timeout: 3000 });

    const badgeText = await badge.textContent();
    expect(badgeText).toMatch(/LLM: (OK|ERROR)/i);
  });

  // Note: This test requires backend LLM to be responding. Skip if backend unavailable.
  test.skip('@prod chat returns printable text in response', async ({ page }) => {
    // Monitor network responses
    let chatResponse: any = null;
    page.on('response', async res => {
      if (res.url().includes('/agent/chat') && res.status() === 200) {
        try {
          chatResponse = await res.json();
        } catch {
          // ignore parse errors
        }
      }
    });

    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Type a simple message
    const input = iframe.getByPlaceholder(/Ask or type a command/i);
    await input.fill('hello');
    await page.keyboard.press('Enter');

    // Wait for response (poll for chatResponse to be set)
    await expect.poll(() => chatResponse !== null, {
      timeout: 10000,
      message: 'Expected chat to receive a response from backend'
    }).toBeTruthy();

    // Validate response has printable text
    const text =
      chatResponse.reply ??
      chatResponse.text ??
      chatResponse?.result?.text ??
      (typeof chatResponse === 'string' ? chatResponse : '');

    expect(String(text).length).toBeGreaterThan(0);
    expect(text).not.toBe('⚠️ No text returned. See console for full JSON.');
  });
});
