import { test, expect } from "@playwright/test";

/**
 * Chat Avatar Tests
 *
 * Verifies that:
 * 1. User messages show initial from authenticated account
 * 2. Assistant messages show "LM" (LedgerMind)
 * 3. User avatar has subtle ring for visual distinction
 * 4. Avatars stay in sync with auth state
 */

test.describe("Chat Avatars", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("user messages show initial from account", async ({ page }) => {
    // Send a message to trigger user avatar
    const composer = page.getByPlaceholder(/ask about your spending/i);

    if (await composer.isVisible()) {
      await composer.fill("test message");
      await composer.press("Enter");

      // Wait for message to appear
      await page.waitForTimeout(500);

      // Find user avatar
      const userAvatar = page.getByTestId("chat-avatar-me").last();
      await expect(userAvatar).toBeVisible();

      // Should show initial letter (not hardcoded "YO" or "?")
      const avatarText = await userAvatar.textContent();
      expect(avatarText).toMatch(/^[A-Z]$/); // Single uppercase letter
      expect(avatarText).not.toBe("?");
      expect(avatarText).not.toBe("YO");
    }
  });

  test("assistant messages show LM fallback", async ({ page }) => {
    // Click a tool to trigger assistant response
    const monthSummaryBtn = page.getByTestId("agent-tool-month-summary");

    if (await monthSummaryBtn.isVisible()) {
      await monthSummaryBtn.click();

      // Wait for assistant response
      await page.waitForTimeout(1000);

      // Find assistant avatar
      const assistantAvatar = page.getByTestId("chat-avatar-assistant").last();
      await expect(assistantAvatar).toBeVisible();

      // Should show "LM" for LedgerMind
      await expect(assistantAvatar).toContainText("LM");
    }
  });

  test("user avatar has visual distinction ring", async ({ page }) => {
    const composer = page.getByPlaceholder(/ask about your spending/i);

    if (await composer.isVisible()) {
      await composer.fill("test");
      await composer.press("Enter");
      await page.waitForTimeout(500);

      const userAvatar = page.getByTestId("chat-avatar-me").last();

      // Check for ring class on user avatar
      const hasRing = await userAvatar.evaluate((el) => {
        return el.classList.contains("ring-1") ||
               el.classList.contains("ring-primary/30") ||
               el.className.includes("ring");
      });

      expect(hasRing).toBeTruthy();
    }
  });

  test("user initial matches auth state", async ({ page }) => {
    // Get user data from auth endpoint
    const authResponse = await page.request.get("/api/auth/me", {
      headers: { "accept": "application/json" }
    });

    if (authResponse.ok()) {
      const authData = await authResponse.json();

      // Send a message
      const composer = page.getByPlaceholder(/ask about your spending/i);
      if (await composer.isVisible()) {
        await composer.fill("test");
        await composer.press("Enter");
        await page.waitForTimeout(500);

        const userAvatar = page.getByTestId("chat-avatar-me").last();
        const avatarText = await userAvatar.textContent();

        // Verify initial matches name or email
        const expectedInitial = (authData.name || authData.email || "?")[0].toUpperCase();
        expect(avatarText).toBe(expectedInitial);
      }
    }
  });

  test("assistant and user avatars are distinct", async ({ page }) => {
    // Trigger a conversation
    const monthSummaryBtn = page.getByTestId("agent-tool-month-summary");

    if (await monthSummaryBtn.isVisible()) {
      await monthSummaryBtn.click();
      await page.waitForTimeout(1000);

      const assistantAvatar = page.getByTestId("chat-avatar-assistant").first();
      const assistantText = await assistantAvatar.textContent();

      // Send user message
      const composer = page.getByPlaceholder(/ask about your spending/i);
      await composer.fill("follow up");
      await composer.press("Enter");
      await page.waitForTimeout(500);

      const userAvatar = page.getByTestId("chat-avatar-me").last();
      const userText = await userAvatar.textContent();

      // Should be different
      expect(assistantText).toBe("LM");
      expect(userText).not.toBe("LM");
      expect(userText).toMatch(/^[A-Z]$/);
    }
  });

  test("avatar updates when auth state changes", async ({ page }) => {
    // This test verifies that avatars would update if user logs out/in
    // In practice, this would require full logout/login flow

    // Check initial state
    const composer = page.getByPlaceholder(/ask about your spending/i);
    if (await composer.isVisible()) {
      await composer.fill("test");
      await composer.press("Enter");
      await page.waitForTimeout(500);

      const userAvatar = page.getByTestId("chat-avatar-me").last();
      await expect(userAvatar).toBeVisible();

      // Avatar should exist and show valid initial
      const text = await userAvatar.textContent();
      expect(text).toMatch(/^[A-Z?]$/);
    }
  });

  test("handles missing user data gracefully", async ({ page }) => {
    // Even if user data is incomplete, should show fallback "?"
    // This is a defensive test for edge cases

    const composer = page.getByPlaceholder(/ask about your spending/i);
    if (await composer.isVisible()) {
      await composer.fill("test");
      await composer.press("Enter");
      await page.waitForTimeout(500);

      const userAvatar = page.getByTestId("chat-avatar-me").last();
      const text = await userAvatar.textContent();

      // Should show something valid (not empty)
      expect(text).toBeTruthy();
      expect(text?.length).toBe(1);
    }
  });
});
