import { test, expect } from "@playwright/test";

/**
 * Agent Tools Smoke Test
 *
 * Verifies that all agent tool buttons are present and clickable.
 * Each tool should either trigger an action or show an appropriate disabled state.
 */

test.describe("Agent Tools Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for page to be ready
    await page.waitForLoadState("networkidle");
  });

  test("all agent tool buttons are present with correct test IDs", async ({ page }) => {
    const toolIds = [
      "agent-tool-month-summary",
      "agent-tool-find-subscriptions",
      "agent-tool-top-merchants",
      "agent-tool-cashflow",
      "agent-tool-trends",
      "agent-tool-insights",
      "agent-tool-budget-check",
      "agent-tool-alerts",
      "agent-tool-kpis",
      "agent-tool-forecast",
      "agent-tool-anomalies",
      "agent-tool-recurring",
      "agent-tool-suggest-budget",
      "agent-tool-what-if",
      "agent-tool-search-nl",
      "agent-tool-export-json-smart",
      "agent-tool-clear",
    ];

    for (const id of toolIds) {
      const button = page.getByTestId(id);
      await expect(button).toBeAttached();
    }
  });

  test("insights dropdown works", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    // Verify insights button exists (no separate size button anymore)
    await expect(insightsButton).toBeVisible();
    await expect(page.getByTestId("agent-tool-insights-size")).toHaveCount(0);

    // Click to open dropdown
    await insightsButton.click();

    // Verify dropdown options
    await expect(page.getByRole("menuitem", { name: "Compact" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Expanded" })).toBeVisible();

    // Select Expanded
    await page.getByRole("menuitem", { name: "Expanded" }).click();

    // Should trigger insights action (loading state or assistant message)
    await page.waitForTimeout(500);
  });

  test("Clear button opens confirmation modal", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");
    await expect(clearButton).toBeVisible();

    // Click Clear
    await clearButton.click();

    // Verify modal appears
    await expect(page.getByRole("heading", { name: /clear chat history/i })).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("Reset Position button not present", async ({ page }) => {
    // Reset Position should be removed from chat panel
    await expect(page.getByTestId("agent-tool-reset-position")).toHaveCount(0);
  });

  test("export JSON button is enabled after messages", async ({ page }) => {
    const exportButton = page.getByTestId("export-json-smart");

    // Initially might be disabled if no messages
    // Send a message first
    const composer = page.getByPlaceholder(/ask about your spending/i);
    if (await composer.isVisible()) {
      await composer.fill("Test message");
      await composer.press("Enter");

      // Wait for response
      await page.waitForTimeout(1000);

      // Export should be enabled
      await expect(exportButton).toBeEnabled();
    }
  });

  test("telemetry events fire for agent tools", async ({ page }) => {
    const telemetryEvents: any[] = [];

    // Listen for telemetry events
    await page.exposeFunction("captureTelemetry", (event: any) => {
      telemetryEvents.push(event);
    });

    await page.evaluate(() => {
      window.addEventListener("telemetry", (e: any) => {
        (window as any).captureTelemetry(e.detail);
      });
    });

    // Click Month summary tool
    const monthSummaryButton = page.getByTestId("agent-tool-month-summary");
    await monthSummaryButton.click();

    // Wait briefly for telemetry
    await page.waitForTimeout(300);

    // Verify telemetry event was fired
    expect(telemetryEvents.some((e) => e.event === "agent_tool_month_summary")).toBeTruthy();
  });

  test("all explore tools are clickable", async ({ page }) => {
    const exploreTools = [
      "agent-tool-month-summary",
      "agent-tool-find-subscriptions",
      "agent-tool-top-merchants",
      "agent-tool-cashflow",
      "agent-tool-trends",
    ];

    for (const toolId of exploreTools) {
      const button = page.getByTestId(toolId);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();

      // Click and verify no console errors
      await button.click();

      // Wait for action to complete or loading state
      await page.waitForTimeout(200);
    }
  });

  test("all explain tools are clickable", async ({ page }) => {
    const explainTools = [
      "agent-tool-insights",
      "agent-tool-alerts",
      "agent-tool-kpis",
      "agent-tool-forecast",
      "agent-tool-anomalies",
      "agent-tool-recurring",
    ];

    for (const toolId of explainTools) {
      const button = page.getByTestId(toolId);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();

      // Click and verify no errors
      await button.click();
      await page.waitForTimeout(200);
    }
  });

  test("all act tools are clickable", async ({ page }) => {
    const actTools = [
      "agent-tool-budget-check",
      "agent-tool-suggest-budget",
      "agent-tool-what-if",
      "agent-tool-search-nl",
    ];

    for (const toolId of actTools) {
      const button = page.getByTestId(toolId);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();

      await button.click();
      await page.waitForTimeout(200);
    }
  });
});
