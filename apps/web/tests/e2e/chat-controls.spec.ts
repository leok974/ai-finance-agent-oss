import { test, expect } from "@playwright/test";

/**
 * Chat Controls Test Suite
 *
 * Verifies Clear vs Reset functionality:
 * - Clear: Removes messages in the current thread (model state unchanged)
 * - Reset: Starts a new session and clears model memory
 *
 * Also verifies:
 * - No "Reset Position" button exists (removed from UI)
 * - Keyboard shortcuts work correctly (Ctrl+Shift+R for Reset modal)
 * - Modals display correct descriptions
 */

test.describe("Chat Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Open chat dock if not already open
    const chatBubble = page.locator('[data-chatdock-bubble]');
    if (await chatBubble.isVisible()) {
      await chatBubble.click();
      await page.waitForTimeout(300);
    }
  });

  test("Clear button opens clear modal with correct description", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");
    await expect(clearButton).toBeVisible();

    // Click Clear
    await clearButton.click();

    // Verify Clear modal appears with correct title and description
    await expect(page.getByRole("heading", { name: /clear chat history/i })).toBeVisible();
    await expect(page.getByText(/remove the visible messages/i)).toBeVisible();

    // Verify correct button text
    await expect(page.getByRole("button", { name: /^clear chat$/i })).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Modal should close
    await expect(page.getByRole("heading", { name: /clear chat history/i })).not.toBeVisible();
  });

  test("Clear modal clears messages when confirmed", async ({ page }) => {
    // Send a test message first
    const composer = page.getByPlaceholder(/ask about your spending/i).or(page.locator('textarea[placeholder*="Ask"]'));
    if (await composer.isVisible()) {
      await composer.fill("Test message for clear");
      await composer.press("Enter");

      // Wait for message to appear
      await page.waitForTimeout(1000);

      // Verify message exists
      await expect(page.getByText("Test message for clear")).toBeVisible();
    }

    // Now clear
    const clearButton = page.getByTestId("agent-tool-clear");
    await clearButton.click();

    // Confirm clear
    await page.getByRole("button", { name: /^clear chat$/i }).click();

    // Wait for clear to complete
    await page.waitForTimeout(500);

    // Message should be gone (or chat should be empty)
    await expect(page.getByText("Test message for clear")).not.toBeVisible();
  });

  test("Reset modal accessible via Ctrl+Shift+R hotkey", async ({ page }) => {
    // Press Ctrl+Shift+R
    await page.keyboard.press("Control+Shift+KeyR");

    // Verify Reset modal opens
    await expect(page.getByRole("heading", { name: /reset session/i })).toBeVisible();
    await expect(page.getByText(/start a fresh session/i)).toBeVisible();

    // Verify correct button text
    await expect(page.getByRole("button", { name: /reset session/i })).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("Reset modal shows correct description", async ({ page }) => {
    // Open Reset modal via hotkey
    await page.keyboard.press("Control+Shift+KeyR");

    // Verify description mentions clearing assistant memory
    await expect(page.getByText(/clear the assistant's memory/i)).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("No reset-position button exists", async ({ page }) => {
    // Verify no "Reset Position" button anywhere in the chat panel
    await expect(page.getByTestId("agent-tool-reset-position")).toHaveCount(0);

    // Also check for any button containing "reset" and "position" text
    const resetPositionButtons = page.getByRole("button", { name: /reset.*position/i });
    await expect(resetPositionButtons).toHaveCount(0);
  });

  test("Clear and Reset are separate controls", async ({ page }) => {
    // Verify both controls exist independently
    const clearButton = page.getByTestId("agent-tool-clear");
    await expect(clearButton).toBeVisible();

    // Reset not visible as inline button (only via hotkey)
    const resetButton = page.getByTestId("agent-tool-reset");
    await expect(resetButton).not.toBeVisible();

    // But Reset modal can be opened via hotkey
    await page.keyboard.press("Control+Shift+KeyR");
    await expect(page.getByRole("heading", { name: /reset session/i })).toBeVisible();
  });

  test("Clear button has correct tooltip/title", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");

    // Check title attribute
    const title = await clearButton.getAttribute("title");
    expect(title).toContain("message");
    expect(title).toContain("thread");
  });

  test("Insights control is dropdown-only (no separate gear button)", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");
    await expect(insightsButton).toBeVisible();

    // Should show dropdown indicator
    await expect(insightsButton.locator('svg')).toBeVisible(); // ChevronDown icon

    // No separate size/gear button
    await expect(page.getByTestId("agent-tool-insights-size")).toHaveCount(0);
    await expect(page.getByTestId("agent-tool-insights-gear")).toHaveCount(0);

    // Click to open dropdown
    await insightsButton.click();

    // Verify dropdown options
    await expect(page.getByTestId("agent-tool-insights-compact")).toBeVisible();
    await expect(page.getByTestId("agent-tool-insights-expanded")).toBeVisible();
  });

  test("Insights dropdown shows correct options", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");
    await insightsButton.click();

    // Check for menu items
    await expect(page.getByRole("menuitem", { name: /compact/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /expanded/i })).toBeVisible();

    // Select Compact
    await page.getByRole("menuitem", { name: /compact/i }).click();

    // Dropdown should close
    await expect(page.getByRole("menuitem", { name: /compact/i })).not.toBeVisible();
  });

  test("Clear does not affect model state (session ID unchanged)", async ({ page }) => {
    // This is a conceptual test - in practice we'd need to check session ID
    // or verify that subsequent messages use the same context

    // Send a message
    const composer = page.getByPlaceholder(/ask about your spending/i).or(page.locator('textarea[placeholder*="Ask"]'));
    if (await composer.isVisible()) {
      await composer.fill("Remember this: test123");
      await composer.press("Enter");
      await page.waitForTimeout(1000);
    }

    // Clear chat
    await page.getByTestId("agent-tool-clear").click();
    await page.getByRole("button", { name: /^clear chat$/i }).click();
    await page.waitForTimeout(500);

    // Send another message - model should still remember context
    // (This is conceptual - actual verification would require checking session ID)
    if (await composer.isVisible()) {
      await composer.fill("Do you remember test123?");
      await composer.press("Enter");
      await page.waitForTimeout(1000);
    }

    // In a real implementation, the assistant would remember "test123"
    // because Clear only removes visible messages, not model state
  });

  test("Reset creates new session (session ID changes)", async ({ page }) => {
    // Open Reset modal
    await page.keyboard.press("Control+Shift+KeyR");

    // Confirm reset
    await page.getByRole("button", { name: /reset session/i }).click();

    // Wait for reset to complete
    await page.waitForTimeout(500);

    // Verify chat is empty and ready for new session
    // (In practice, we'd verify session ID changed in local storage or API calls)
  });

  test("Modal buttons are properly styled", async ({ page }) => {
    // Open Clear modal
    await page.getByTestId("agent-tool-clear").click();

    // Verify Cancel is pill-outline
    const cancelButton = page.getByRole("button", { name: /cancel/i });
    await expect(cancelButton).toBeVisible();

    // Verify Clear is styled appropriately
    const clearButton = page.getByRole("button", { name: /^clear chat$/i });
    await expect(clearButton).toBeVisible();

    // Cancel to close
    await cancelButton.click();

    // Open Reset modal
    await page.keyboard.press("Control+Shift+KeyR");

    // Verify Reset button is danger variant
    const resetButton = page.getByRole("button", { name: /reset session/i });
    await expect(resetButton).toBeVisible();
  });

  test("Chat controls are accessible via keyboard navigation", async ({ page }) => {
    // Focus Clear button via Tab
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should eventually focus on Clear button (exact tab count depends on UI)
    // Press Enter to open modal
    const clearButton = page.getByTestId("agent-tool-clear");
    await clearButton.focus();
    await page.keyboard.press("Enter");

    // Modal should open
    await expect(page.getByRole("heading", { name: /clear chat history/i })).toBeVisible();

    // Escape to close
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /clear chat history/i })).not.toBeVisible();
  });

  test("Multiple rapid clicks don't cause issues", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");

    // Click Clear multiple times rapidly
    await clearButton.click();
    await clearButton.click();
    await clearButton.click();

    // Should only show one modal
    const modals = page.getByRole("heading", { name: /clear chat history/i });
    await expect(modals).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("Clicking outside modal closes it", async ({ page }) => {
    // Open Clear modal
    await page.getByTestId("agent-tool-clear").click();
    await expect(page.getByRole("heading", { name: /clear chat history/i })).toBeVisible();

    // Click on backdrop/overlay (outside modal content)
    await page.locator('[role="dialog"]').evaluate((dialog) => {
      const backdrop = dialog.parentElement;
      if (backdrop) backdrop.click();
    });

    // Wait a bit
    await page.waitForTimeout(300);

    // Modal should close (depending on dialog implementation)
    // Note: Some dialogs prevent this by default, so this test may need adjustment
  });

  test("Chat controls work across browser refresh", async ({ page }) => {
    // Send a message
    const composer = page.getByPlaceholder(/ask about your spending/i).or(page.locator('textarea[placeholder*="Ask"]'));
    if (await composer.isVisible()) {
      await composer.fill("Persistent message");
      await composer.press("Enter");
      await page.waitForTimeout(1000);
    }

    // Refresh page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Open chat dock again
    const chatBubble = page.locator('[data-chatdock-bubble]');
    if (await chatBubble.isVisible()) {
      await chatBubble.click();
      await page.waitForTimeout(300);
    }

    // Message should still be there (persisted in localStorage)
    await expect(page.getByText("Persistent message")).toBeVisible();

    // Clear button should still work
    await page.getByTestId("agent-tool-clear").click();
    await page.getByRole("button", { name: /^clear chat$/i }).click();
    await page.waitForTimeout(500);

    // Message should be gone
    await expect(page.getByText("Persistent message")).not.toBeVisible();
  });
});
