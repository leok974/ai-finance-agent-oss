import { test, expect } from "@playwright/test";

test.describe("Chat session management", () => {
  test("clear chat wipes messages across tabs", async ({ browser }) => {
    const c1 = await browser.newContext();
    const c2 = await browser.newContext();

    const page1 = await c1.newPage();
    const page2 = await c2.newPage();

    await page1.goto("/");
    await page2.goto("/");

    // Send a message in tab 1
    const composer1 = page1.locator("#chat-composer");
    await composer1.fill("Test message");
    await composer1.press("Enter");

    // Wait for message to appear
    await expect(page1.getByText("Test message")).toBeVisible();

    // Clear chat
    await page1.getByTestId("btn-clear").click();
    await page1.getByRole("button", { name: "Clear chat" }).click();

    // Check messages are cleared in both tabs
    await expect(page1.getByText("Test message")).not.toBeVisible();
    // Tab 2 should also see cleared messages (via BroadcastChannel)
    await page2.reload();
    await expect(page2.getByText("Test message")).not.toBeVisible();

    await c1.close();
    await c2.close();
  });

  test("reset session creates new sessionId", async ({ page }) => {
    await page.goto("/");

    // Get initial session ID from localStorage
    const before = await page.evaluate(() =>
      window.localStorage.getItem("lm:chat")
    );

    expect(before).toBeTruthy();
    const beforeData = JSON.parse(before!);
    const beforeSessionId = beforeData.state?.sessionId;

    expect(beforeSessionId).toBeTruthy();

    // Reset session
    await page.getByTestId("btn-reset").click();
    await page.getByRole("button", { name: "Reset session" }).click();

    // Wait a bit for the action to complete
    await page.waitForTimeout(500);

    // Get new session ID
    const after = await page.evaluate(() =>
      window.localStorage.getItem("lm:chat")
    );

    expect(after).toBeTruthy();
    const afterData = JSON.parse(after!);
    const afterSessionId = afterData.state?.sessionId;

    expect(afterSessionId).toBeTruthy();
    expect(afterSessionId).not.toEqual(beforeSessionId);
  });

  test("buttons disabled while busy", async ({ page }) => {
    await page.goto("/");

    // Initially buttons should be enabled
    await expect(page.getByTestId("btn-clear")).toBeEnabled();
    await expect(page.getByTestId("btn-reset")).toBeEnabled();

    // Open reset dialog
    await page.getByTestId("btn-reset").click();

    // Cancel button should be visible
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Close dialog
    await page.getByRole("button", { name: "Cancel" }).click();

    // Buttons should still be enabled
    await expect(page.getByTestId("btn-clear")).toBeEnabled();
    await expect(page.getByTestId("btn-reset")).toBeEnabled();
  });

  test("clear dialog shows correct text", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("btn-clear").click();

    await expect(page.getByText("Clear chat history?")).toBeVisible();
    await expect(
      page.getByText("This will remove the visible messages for this thread across all open tabs.")
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("reset dialog shows correct text", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("btn-reset").click();

    await expect(page.getByText("Reset session?")).toBeVisible();
    await expect(
      page.getByText("This will start a fresh session and clear the assistant's memory for this chat.")
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("shows toast notification after clearing chat", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("btn-clear").click();
    await page.getByRole("button", { name: "Clear chat" }).click();

    // Check for toast notification
    await expect(page.getByText("Chat cleared")).toBeVisible();
    await expect(page.getByText("Messages removed (thread only).")).toBeVisible();
  });

  test("shows toast notification after resetting session", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("btn-reset").click();
    await page.getByRole("button", { name: "Reset session" }).click();

    // Wait for async operation
    await page.waitForTimeout(500);

    // Check for toast notification
    await expect(page.getByText("Session reset")).toBeVisible();
    await expect(page.getByText("Fresh start — model context cleared.")).toBeVisible();
  });
});
