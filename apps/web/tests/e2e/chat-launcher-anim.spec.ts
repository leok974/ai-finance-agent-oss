/**
 * chat-launcher-anim.spec.ts - Launcher morph animation E2E test
 *
 * Tests the smooth morphing animation between bubble and panel states.
 * Verifies CSS class toggling and visual states without asserting on animation frames.
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe("@prod-critical Chat launcher morph", () => {
  test("bubble hides and panel shows from same corner", async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=0&prefetch=0&panel=0`);

    // Wait for page load
    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId("chat-launcher-root");
    const bubble = page.getByTestId("chat-toggle");
    const shell = page.getByTestId("chat-shell");
    const backdrop = page.getByTestId("chat-backdrop");

    // Closed: bubble visible, shell hidden
    await expect(launcher).toHaveClass(/lm-chat-launcher--closed/);
    await expect(bubble).toBeVisible();
    
    // Shell should exist but be scaled down (opacity 0 via CSS)
    await expect(shell).toHaveCSS("opacity", "0");

    // Click bubble → open
    await bubble.click();

    // Wait for class to update
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    // Panel should be visible (opacity 1)
    await expect(shell).toHaveCSS("opacity", "1");

    // Backdrop should be visible
    await expect(backdrop).toBeVisible();

    // Close via backdrop
    await backdrop.click();

    // Should return to closed state
    await expect(launcher).toHaveClass(/lm-chat-launcher--closed/);
    await expect(shell).toHaveCSS("opacity", "0");
  });

  test("shell and bubble are siblings under launcher root", async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=0&prefetch=0&panel=0`);

    await page.waitForLoadState('networkidle');

    // Verify DOM structure
    const launcher = page.getByTestId("chat-launcher-root");
    const bubble = page.getByTestId("chat-toggle");
    const shell = page.getByTestId("chat-shell");
    const backdrop = page.getByTestId("chat-backdrop");

    // All should exist
    await expect(launcher).toBeVisible();
    await expect(bubble).toBeVisible();
    await expect(shell).toBeAttached(); // exists in DOM even if invisible
    await expect(backdrop).toBeAttached();

    // Shell and bubble should be children of launcher
    const bubbleParent = await bubble.evaluate((el) => el.parentElement?.dataset?.testid);
    const shellParent = await shell.evaluate((el) => el.parentElement?.dataset?.testid);

    expect(bubbleParent).toBe("chat-launcher-root");
    expect(shellParent).toBe("chat-launcher-root");
  });

  test("multiple open/close cycles work correctly", async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=0&prefetch=0&panel=0`);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId("chat-launcher-root");
    const bubble = page.getByTestId("chat-toggle");
    const backdrop = page.getByTestId("chat-backdrop");

    // Cycle 1: open → close
    await bubble.click();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    await backdrop.click();
    await expect(launcher).toHaveClass(/lm-chat-launcher--closed/);

    // Cycle 2: open → close
    await bubble.click();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    await backdrop.click();
    await expect(launcher).toHaveClass(/lm-chat-launcher--closed/);

    // Cycle 3: open and leave open
    await bubble.click();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);
  });
});
