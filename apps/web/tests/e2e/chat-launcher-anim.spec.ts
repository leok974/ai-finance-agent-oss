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
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // Wait for page load
    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId("lm-chat-launcher-root");
    const bubble = page.getByTestId("lm-chat-launcher-bubble");
    const shell = page.getByTestId("lm-chat-launcher-shell");
    const backdrop = page.getByTestId("lm-chat-launcher-backdrop");

    // Wait for launcher to be visible
    await launcher.waitFor({ state: 'visible', timeout: 10000 });

    // Closed: bubble visible, shell hidden
    await expect(launcher).toHaveAttribute("data-state", "closed");
    await expect(bubble).toBeVisible();

    // Shell should exist but be scaled down (opacity 0 via CSS)
    await expect(shell).toHaveCSS("opacity", "0");

    // Click bubble → open
    await bubble.click();

    // Wait for state to update
    await expect(launcher).toHaveAttribute("data-state", "open");

    // Panel should be visible (opacity 1)
    await expect(shell).toHaveCSS("opacity", "1");

    // Backdrop should be attached and clickable (has pointer-events-auto)
    await expect(backdrop).toBeAttached();
    await expect(backdrop).toHaveCSS("pointer-events", "auto");

    // Close via backdrop (force click since backdrop might be visually transparent)
    await backdrop.click({ force: true });

    // Should return to closed state
    await expect(launcher).toHaveAttribute("data-state", "closed");
    await expect(shell).toHaveCSS("opacity", "0");
  });

  test("shell and bubble are siblings under launcher root", async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    await page.waitForLoadState('networkidle');

    // Verify DOM structure
    const launcher = page.getByTestId("lm-chat-launcher-root");
    const bubble = page.getByTestId("lm-chat-launcher-bubble");
    const shell = page.getByTestId("lm-chat-launcher-shell");
    const backdrop = page.getByTestId("lm-chat-launcher-backdrop");

    // Wait for launcher to be visible
    await launcher.waitFor({ state: 'visible', timeout: 10000 });

    // All should exist
    await expect(launcher).toBeVisible();
    await expect(bubble).toBeVisible();
    await expect(shell).toBeAttached(); // exists in DOM even if invisible
    await expect(backdrop).toBeAttached();

    // Shell and bubble should be children of launcher
    const bubbleParent = await bubble.evaluate((el) => el.parentElement?.dataset?.testid);
    const shellParent = await shell.evaluate((el) => el.parentElement?.dataset?.testid);

    expect(bubbleParent).toBe("lm-chat-launcher-root");
    expect(shellParent).toBe("lm-chat-launcher-root");
  });

  test("multiple open/close cycles work correctly", async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId("lm-chat-launcher-root");
    const bubble = page.getByTestId("lm-chat-launcher-bubble");
    const backdrop = page.getByTestId("lm-chat-launcher-backdrop");

    // Wait for launcher to be visible
    await launcher.waitFor({ state: 'visible', timeout: 10000 });

    // Cycle 1: open → close
    await bubble.click();
    await expect(launcher).toHaveAttribute("data-state", "open");

    await backdrop.click({ force: true });
    await expect(launcher).toHaveAttribute("data-state", "closed");

    // Cycle 2: open → close
    await bubble.click();
    await expect(launcher).toHaveAttribute("data-state", "open");

    await backdrop.click({ force: true });
    await expect(launcher).toHaveAttribute("data-state", "closed");

    // Cycle 3: open and leave open
    await bubble.click();
    await expect(launcher).toHaveAttribute("data-state", "open");
  });
});
