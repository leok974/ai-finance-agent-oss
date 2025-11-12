/**
 * chat-actions.spec.ts - E2E tests for chat message/tool functionality
 *
 * Validates that the parent↔iframe handshake works and chat can call backend APIs.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat Actions @prod', () => {
  test('chat responds to a user message', async ({ page }) => {
    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Monitor network requests
    const chatRequests: any[] = [];
    page.on('request', req => {
      if (req.url().includes('/agent/chat')) {
        chatRequests.push({ url: req.url(), method: req.method(), postData: req.postDataJSON() });
      }
    });

    // Type a message and submit
    const input = iframe.getByPlaceholder(/Ask or type a command/i);
    await input.fill('ping');
    await page.keyboard.press('Enter');

    // Wait for the request to be made (backend may not respond yet)
    await expect.poll(() => chatRequests.length > 0, {
      timeout: 5000,
      message: 'Expected chat message to trigger /agent/chat API call'
    }).toBeTruthy();

    // Verify request structure
    expect(chatRequests[0].method).toBe('POST');
    expect(chatRequests[0].postData).toHaveProperty('text', 'ping');
  });

  test('tool button triggers a server call', async ({ page }) => {
    // Monitor network requests BEFORE opening chat
    const toolRequests: any[] = [];
    page.on('request', req => {
      if (req.url().includes('/agent/chat')) {
        toolRequests.push({ url: req.url(), method: req.method(), postData: req.postDataJSON() });
      }
    });

    // Enable chat and open it
    await page.goto(`${BASE_URL}?chat=1`);
    await page.getByTestId('lm-chat-bubble').click();

    // Wait for iframe to be visible
    const iframe = page.frameLocator('[data-testid="lm-chat-iframe"]');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 5000 });

    // Click a tool button
    const toolButton = iframe.getByRole('button', { name: /Month summary/i });
    await toolButton.click();

    // Wait for the request to be made
    await expect.poll(() => toolRequests.length > 0, {
      timeout: 5000,
      message: 'Expected tool button to trigger /agent/chat API call'
    }).toBeTruthy();

    // Verify request structure
    expect(toolRequests[0].method).toBe('POST');
    expect(toolRequests[0].postData).toHaveProperty('tool', 'month_summary');
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
});
