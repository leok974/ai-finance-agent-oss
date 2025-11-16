import { test, expect } from "@playwright/test";

/**
 * E2E Test: Page Scroll with ChatDock
 *
 * Validates that the page can scroll when:
 * 1. Chat is closed
 * 2. Chat is open
 *
 * This ensures ChatDock never locks page scroll via:
 * - overflow: hidden on body/html
 * - pointer-events on full-screen overlays
 *
 * Run against production:
 *   $env:PW_SKIP_WS='1'
 *   $env:BASE_URL='https://app.ledger-mind.org'
 *   pnpm exec playwright test tests/e2e/chat-page-scroll.spec.ts --project=chromium-prod
 */

test.describe("ChatDock page scroll behavior", () => {
  test("page scrolls with chat closed and open @prod", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    // Start at top
    await page.evaluate(() => window.scrollTo(0, 0));
    const top0 = await page.evaluate(() => window.scrollY);
    expect(top0).toBe(0);

    // Scroll page with chat CLOSED
    await page.mouse.wheel(0, 600);
    const topAfter = await page.evaluate(() => window.scrollY);
    expect(topAfter).toBeGreaterThan(100);

    // Open chat
    const launchButton = page.getByTestId("lm-chat-launcher-button");
    await launchButton.click();

    // Make sure shell is visible
    const shell = page.getByTestId("lm-chat-shell");
    await expect(shell).toBeVisible();

    // Reset scroll to top
    await page.evaluate(() => window.scrollTo(0, 0));
    const topOpen0 = await page.evaluate(() => window.scrollY);
    expect(topOpen0).toBe(0);

    // Scroll page with chat OPEN
    await page.mouse.wheel(0, 600);
    const topOpenAfter = await page.evaluate(() => window.scrollY);
    expect(topOpenAfter).toBeGreaterThan(100);
  });

  test('page does not have overflow hidden when chat opens/closes @prod', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Check initial state (chat closed)
    let bodyOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.body).overflow
    );
    let htmlOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).overflow
    );

    // Should NOT be hidden
    expect(bodyOverflow).not.toBe('hidden');
    expect(htmlOverflow).not.toBe('hidden');

    // Open chat
    const bubble = page.getByTestId('lm-chat-launcher-button');
    await bubble.click();
    await page.waitForTimeout(300);

    // Check overflow when open
    bodyOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.body).overflow
    );
    htmlOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).overflow
    );

    // Should STILL not be hidden
    expect(bodyOverflow).not.toBe('hidden');
    expect(htmlOverflow).not.toBe('hidden');

    // Close chat
    await bubble.click();
    await page.waitForTimeout(300);

    // Check overflow when closed
    bodyOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.body).overflow
    );
    htmlOverflow = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).overflow
    );

    // Should STILL not be hidden
    expect(bodyOverflow).not.toBe('hidden');
    expect(htmlOverflow).not.toBe('hidden');
  });

  test('overlay has correct pointer-events (always none) @prod', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // When closed, overlay should not intercept pointer events
    let overlayPointerEvents = await page.evaluate(() => {
      const overlay = document.querySelector('.lm-chat-overlay') as HTMLElement;
      return overlay ? window.getComputedStyle(overlay).pointerEvents : null;
    });

    expect(overlayPointerEvents).toBe('none');

    // Open chat
    const bubble = page.getByTestId('lm-chat-launcher-button');
    await bubble.click();
    await page.waitForTimeout(300);

    // When open, overlay should STILL have pointer-events: none
    // (only shell gets auto)
    overlayPointerEvents = await page.evaluate(() => {
      const overlay = document.querySelector('.lm-chat-overlay') as HTMLElement;
      return overlay ? window.getComputedStyle(overlay).pointerEvents : null;
    });

    expect(overlayPointerEvents).toBe('none');

    // Shell should be interactive when open
    const shellPointerEvents = await page.evaluate(() => {
      const shell = document.querySelector('.lm-chat-shell') as HTMLElement;
      return shell ? window.getComputedStyle(shell).pointerEvents : null;
    });

    expect(shellPointerEvents).toBe('auto');
  });
});
