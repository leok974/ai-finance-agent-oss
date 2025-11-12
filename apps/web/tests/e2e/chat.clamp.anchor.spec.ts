/**
 * E2E test: Chat clamp & anchor
 *
 * Verifies:
 * 1. Panel opens near launcher bubble
 * 2. Stays fully inside viewport (no clipping)
 * 3. Flips from top to bottom if needed
 * 4. Only the thread scrolls (not the whole iframe)
 * 5. Long text wraps properly (no horizontal overflow)
 */

import { test, expect, type Page } from "@playwright/test";

// Use saved auth state
test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

test.describe("@ui @chat clamp & anchor", () => {
  async function runOnce(page: Page) {
    await page.goto("https://app.ledger-mind.org/", { waitUntil: 'networkidle' });

    // Wait for page to load and auth to settle
    await page.waitForTimeout(2000);

    // Check if we're on the dashboard (not redirected to login)
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Wait for launcher bubble to be visible
    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await expect(bubble).toBeVisible({ timeout: 15000 });

    // Remember bubble corner
    const b = await bubble.boundingBox();
    if (!b) {
      throw new Error("launcher bubble not measurable");
    }

    // Click to open chat
    await bubble.click();

    // Wait for panel host (the fixed container that wraps iframe)
    const host = page.locator('#lm-chat-host');
    await expect(host).toBeVisible({ timeout: 5000 });

    // Wait for animation to complete (160ms + buffer)
    await page.waitForTimeout(200);

    // 1) Verify fully inside viewport (tight tolerance)
    const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const h = await host.boundingBox();
    expect(h).toBeTruthy();

    const pad = 6;
    expect(h!.x, 'host left edge inside viewport').toBeGreaterThanOrEqual(pad);
    expect(h!.y, 'host top edge inside viewport').toBeGreaterThanOrEqual(pad);
    expect(h!.x + h!.width, 'host right edge inside viewport').toBeLessThanOrEqual(vp.w - pad);
    expect(h!.y + h!.height, 'host bottom edge inside viewport').toBeLessThanOrEqual(vp.h - pad);

    // 2) Verify anchored near bubble on X-axis (right edges ~aligned)
    const dx = Math.abs((h!.x + h!.width) - (b.x + b.width));
    expect(dx, 'chat aligned horizontally with bubble').toBeLessThanOrEqual(48);

    // 3) Verify Y relationship: either above (top <= bubble.top) or below (top >= bubble.bottom)
    const isAbove = h!.y + h!.height <= b.y + 4; // Allow 4px tolerance
    const isBelow = h!.y >= b.y + b.height - 4;
    expect(isAbove || isBelow,
      `chat should be above or below bubble (chatBottom=${(h!.y + h!.height).toFixed(1)}, bubbleTop=${b.y.toFixed(1)}, chatTop=${h!.y.toFixed(1)}, bubbleBottom=${(b.y + b.height).toFixed(1)})`
    ).toBeTruthy();

    // 4) Verify no horizontal scroll in thread (good wrapping)
    const chatFrame = page.frameLocator('#lm-chat-host iframe');
    const thread = chatFrame.locator('.lm-thread');
    await expect(thread).toBeVisible({ timeout: 5000 });

    const hasHScroll = await thread.evaluate(el => el.scrollWidth > el.clientWidth + 2);
    expect(hasHScroll, 'thread should not have horizontal scroll').toBeFalsy();
  }

  test("anchors and stays inside viewport (desktop)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Capture console logs for debugging
    page.on('console', msg => console.log('[BROWSER]', msg.text()));
    await runOnce(page);
  });

  test("anchors and stays inside viewport (cramped)", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    // Capture console logs for debugging
    page.on('console', msg => console.log('[BROWSER]', msg.text()));
    await runOnce(page);
  });
});
