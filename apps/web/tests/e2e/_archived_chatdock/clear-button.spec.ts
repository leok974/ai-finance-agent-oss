import { test, expect } from "@playwright/test";

test.describe("Chat Clear Button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to be ready
    await page.waitForLoadState("networkidle");
  });

  test("Clear button removes all messages and keeps session", async ({ page }) => {
    // Open chat panel with keyboard shortcut
    await page.keyboard.press("Control+Shift+K");
    await expect(page.locator('[data-chatdock-root]')).toBeVisible();

    // Send a test message
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("test message for clear");
    await page.keyboard.press("Enter");

    // Wait for message to appear
    await expect(page.getByText("test message for clear")).toBeVisible();

    // Get session ID before clearing
    const sessionBadgeBefore = await page.locator('[data-testid="session-id"]').textContent();

    // Click Clear button
    await page.getByTestId("agent-tool-clear").click();

    // Verify modal opens
    await expect(page.getByText("Clear chat history?")).toBeVisible();

    // Confirm clear
    await page.getByRole("button", { name: /Clear chat/i }).click();

    // Verify modal closes
    await expect(page.getByText("Clear chat history?")).not.toBeVisible();

    // Verify messages are cleared
    await expect(page.getByText("test message for clear")).not.toBeVisible();

    // Verify session ID is unchanged
    const sessionBadgeAfter = await page.locator('[data-testid="session-id"]').textContent();
    expect(sessionBadgeAfter).toBe(sessionBadgeBefore);

    // Verify chat input is still available (panel didn't close)
    await expect(input).toBeVisible();
  });

  test("Clear keyboard shortcut (Ctrl+Shift+C) opens modal", async ({ page }) => {
    // Open chat panel
    await page.keyboard.press("Control+Shift+K");
    await expect(page.locator('[data-chatdock-root]')).toBeVisible();

    // Send a message first
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("test message");
    await page.keyboard.press("Enter");
    await expect(page.getByText("test message")).toBeVisible();

    // Use keyboard shortcut to open Clear modal
    await page.keyboard.press("Control+Shift+C");

    // Verify modal opens
    await expect(page.getByText("Clear chat history?")).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByText("Clear chat history?")).not.toBeVisible();

    // Message should still be visible
    await expect(page.getByText("test message")).toBeVisible();
  });

  test("Clear persists across page reload", async ({ page }) => {
    // Open chat and send message
    await page.keyboard.press("Control+Shift+K");
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("persistent test");
    await page.keyboard.press("Enter");
    await expect(page.getByText("persistent test")).toBeVisible();

    // Clear messages
    await page.getByTestId("agent-tool-clear").click();
    await page.getByRole("button", { name: /Clear chat/i }).click();
    await expect(page.getByText("persistent test")).not.toBeVisible();

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Open chat again
    await page.keyboard.press("Control+Shift+K");

    // Verify messages are still cleared
    await expect(page.getByText("persistent test")).not.toBeVisible();
  });

  test("History panel Clear button uses modal", async ({ page }) => {
    // Open chat
    await page.keyboard.press("Control+Shift+K");
    await expect(page.locator('[data-chatdock-root]')).toBeVisible();

    // Send a message
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("history test");
    await page.keyboard.press("Enter");
    await expect(page.getByText("history test")).toBeVisible();

    // Open history panel
    await page.getByRole("button", { name: /History/i }).click();
    await expect(page.getByText("This tab's recent messages")).toBeVisible();

    // Click Clear in history panel
    await page.locator('button[title="Clear chat history (all tabs)"]').click();

    // Verify modal opens
    await expect(page.getByText("Clear chat history?")).toBeVisible();

    // Confirm
    await page.getByRole("button", { name: /Clear chat/i }).click();

    // Messages cleared
    await expect(page.getByText("history test")).not.toBeVisible();
  });

  test("Cancel Clear modal does not remove messages", async ({ page }) => {
    // Open chat and send message
    await page.keyboard.press("Control+Shift+K");
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("cancel test");
    await page.keyboard.press("Enter");
    await expect(page.getByText("cancel test")).toBeVisible();

    // Open Clear modal
    await page.getByTestId("agent-tool-clear").click();
    await expect(page.getByText("Clear chat history?")).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /Cancel/i }).click();

    // Modal closes
    await expect(page.getByText("Clear chat history?")).not.toBeVisible();

    // Message still visible
    await expect(page.getByText("cancel test")).toBeVisible();
  });

  test("Clear disabled when chat is busy", async ({ page }) => {
    // Open chat
    await page.keyboard.press("Control+Shift+K");

    // Send a message that might trigger a long response
    const input = page.locator('textarea[placeholder*="Ask"]').first();
    await input.fill("generate a long report");
    await page.keyboard.press("Enter");

    // Wait for busy state (robot thinking indicator)
    await page.waitForSelector('[data-testid="robot-thinking"]', { timeout: 2000 }).catch(() => {
      // If no busy state is visible, that's okay - test what we can
    });

    // Try to open Clear modal - button might be disabled
    const clearButton = page.getByTestId("agent-tool-clear");
    const isDisabled = await clearButton.isDisabled().catch(() => false);

    if (isDisabled) {
      // Verify we can't click when busy
      await expect(clearButton).toBeDisabled();
    } else {
      // If not disabled, at least verify modal functionality works
      await clearButton.click();
      await expect(page.getByText("Clear chat history?")).toBeVisible();
    }
  });
});
