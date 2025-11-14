import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('@prod-critical Chat layout fits viewport and shows all UI elements', async ({ page }) => {
  await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

  // Access the iframe content
  const frame = page.frameLocator('#lm-chat-iframe');

  // The shell should be visible
  const shell = frame.getByTestId('lm-chat-iframe');
  await expect(shell).toBeVisible();

  // Assert shell is fully inside viewport (not clipped)
  const bounds = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
    if (!iframe?.contentDocument) return null;
    const el = iframe.contentDocument.querySelector('[data-testid="lm-chat-iframe"]') as HTMLElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      viewportHeight: iframe.contentWindow?.innerHeight ?? 0,
      viewportWidth: iframe.contentWindow?.innerWidth ?? 0,
    };
  });

  expect(bounds).not.toBeNull();
  expect(bounds!.top).toBeGreaterThanOrEqual(0);
  expect(bounds!.bottom).toBeLessThanOrEqual(bounds!.viewportHeight);
  expect(bounds!.left).toBeGreaterThanOrEqual(0);
  expect(bounds!.right).toBeLessThanOrEqual(bounds!.viewportWidth);

  // Header with tools should be visible
  await expect(frame.getByTestId('lm-chat-header')).toBeVisible();

  // Messages scroll area exists and is visible
  const messages = frame.getByTestId('lm-chat-messages');
  await expect(messages).toBeVisible();

  // Input wrapper + textarea visible
  const inputWrapper = frame.getByTestId('lm-chat-input-wrapper');
  await expect(inputWrapper).toBeVisible();

  const input = frame.getByTestId('chat-input');
  await expect(input).toBeVisible();

  // Send button visible
  const sendBtn = frame.getByTestId('chat-send');
  await expect(sendBtn).toBeVisible();

  // Tools should be visible (when toggled on)
  const toolsToggle = frame.getByTestId('chat-tools-toggle');
  await expect(toolsToggle).toBeVisible();

  // Check if tools are visible by default
  const toolsArea = frame.getByTestId('lm-chat-tools');
  const isToolsVisible = await toolsArea.isVisible().catch(() => false);
  
  if (isToolsVisible) {
    // If tools are visible, verify they have proper overflow handling
    const hasOverflow = await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
      const el = iframe?.contentDocument?.querySelector('[data-testid="lm-chat-tools"]') as HTMLElement;
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.overflowY === 'auto' || style.overflowY === 'scroll' || style.display === 'flex';
    });
    expect(hasOverflow).toBe(true);
  }
});

test('@prod-critical Chat messages area is scrollable', async ({ page }) => {
  await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

  const frame = page.frameLocator('#lm-chat-iframe');
  const messages = frame.getByTestId('lm-chat-messages');
  
  await expect(messages).toBeVisible();

  // Verify messages container has overflow-y: auto or scroll
  const isScrollable = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
    const el = iframe?.contentDocument?.querySelector('[data-testid="lm-chat-messages"]') as HTMLElement;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.overflowY === 'auto' || style.overflowY === 'scroll';
  });

  expect(isScrollable).toBe(true);
});

test('@prod-critical Chat shell has visible border and rounded corners', async ({ page }) => {
  await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

  const frame = page.frameLocator('#lm-chat-iframe');
  const shell = frame.getByTestId('lm-chat-iframe');
  
  await expect(shell).toBeVisible();

  // Check for border-radius (visual chrome)
  const hasBorderRadius = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
    const el = iframe?.contentDocument?.querySelector('[data-testid="lm-chat-iframe"]') as HTMLElement;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const radius = style.borderRadius;
    // Should be 1rem (16px) or similar
    return radius !== '0px' && radius !== '' && radius !== 'none';
  });

  expect(hasBorderRadius).toBe(true);

  // Ensure it's bounded (not full viewport)
  const isBounded = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
    const el = iframe?.contentDocument?.querySelector('[data-testid="lm-chat-iframe"]') as HTMLElement;
    if (!el || !iframe?.contentWindow) return false;
    const rect = el.getBoundingClientRect();
    const vh = iframe.contentWindow.innerHeight;
    const vw = iframe.contentWindow.innerWidth;
    // Should be smaller than viewport
    return rect.height < vh || rect.width < vw;
  });

  expect(isBounded).toBe(true);

  // Input and send button should be visible
  await expect(frame.getByTestId('chat-input')).toBeVisible();
  await expect(frame.getByTestId('chat-send')).toBeVisible();
});
