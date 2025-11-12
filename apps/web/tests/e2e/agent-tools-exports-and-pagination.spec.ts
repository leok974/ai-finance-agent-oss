/**
 * E2E tests for agent tool export buttons and pagination controls.
 *
 * Verifies:
 * - Export buttons (JSON, Markdown, CSV) have stable test IDs
 * - Telemetry fires correctly
 * - Downloads are triggered
 * - Pagination buttons have stable test IDs
 */

import { test, expect } from "@playwright/test";

test.describe("Agent Tools - Exports & Pagination", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to be ready
    await expect(page.locator("body")).toBeVisible();
  });

  test("export JSON button has stable test ID and is visible", async ({ page }) => {
    const exportJsonBtn = page.getByTestId("agent-tool-export-json");
    await expect(exportJsonBtn).toBeVisible();
    await expect(exportJsonBtn).toHaveText("Export JSON");
  });

  test("export Markdown button has stable test ID and is visible", async ({ page }) => {
    const exportMdBtn = page.getByTestId("agent-tool-export-markdown");
    await expect(exportMdBtn).toBeVisible();
    await expect(exportMdBtn).toHaveText("Export Markdown");
  });

  test("export CSV button has stable test ID and is visible", async ({ page }) => {
    const exportCsvBtn = page.getByTestId("agent-tool-export-csv");
    await expect(exportCsvBtn).toBeVisible();
    await expect(exportCsvBtn).toContainText("Export CSV");
  });

  test("pagination prev button has stable test ID", async ({ page }) => {
    await expect(page.getByTestId("agent-tool-prev-nl")).toBeVisible();
    await expect(page.getByTestId("agent-tool-prev-nl")).toContainText("Prev page");
  });

  test("pagination next button has stable test ID", async ({ page }) => {
    await expect(page.getByTestId("agent-tool-next-nl")).toBeVisible();
    await expect(page.getByTestId("agent-tool-next-nl")).toContainText("Next page");
  });

  test("export JSON triggers download with correct filename pattern", async ({ page }) => {
    // First, ensure there are messages in the chat (needed for export to be enabled)
    // You might need to trigger a Month summary or add a message first

    // Click Month summary to generate content
    const monthSummaryBtn = page.getByTestId("agent-tool-month-summary");
    await monthSummaryBtn.click();

    // Wait for response (assistant message)
    await page.waitForTimeout(2000); // Wait for assistant to respond

    // Now export JSON should be enabled
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("agent-tool-export-json").click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Should match either finance-summary-*.json or finance-agent-chat-*.json
    expect(filename).toMatch(/(finance-summary|finance-agent-chat).*\.json$/);
  });

  test("export Markdown triggers download with correct filename pattern", async ({ page }) => {
    // Click Month summary to generate content
    const monthSummaryBtn = page.getByTestId("agent-tool-month-summary");
    await monthSummaryBtn.click();

    // Wait for response
    await page.waitForTimeout(2000);

    // Export Markdown
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("agent-tool-export-markdown").click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    // Should match either finance-summary-*.md or finance-agent-chat-*.md
    expect(filename).toMatch(/(finance-summary|finance-agent-chat).*\.md$/);
  });

  test("telemetry events fire for export buttons", async ({ page }) => {
    // Set up telemetry listener
    const telemetryEvents: string[] = [];
    await page.exposeFunction("captureTelemetry", (event: string) => {
      telemetryEvents.push(event);
    });

    await page.addInitScript(() => {
      window.addEventListener("telemetry", (e: any) => {
        (window as any).captureTelemetry(e.detail.event);
      });
    });

    // Reload to apply init script
    await page.goto("/");

    // Trigger Month summary to enable exports
    const monthSummaryBtn = page.getByTestId("agent-tool-month-summary");
    await monthSummaryBtn.click();
    await page.waitForTimeout(2000);

    // Click export buttons
    await page.getByTestId("agent-tool-export-json").click();
    await page.waitForTimeout(500);

    await page.getByTestId("agent-tool-export-markdown").click();
    await page.waitForTimeout(500);

    // Verify telemetry events were fired
    expect(telemetryEvents).toContain("agent_tool_export_json");
    expect(telemetryEvents).toContain("agent_tool_export_markdown");
  });

  test("pagination buttons are disabled when no NL query exists", async ({ page }) => {
    const prevBtn = page.getByTestId("agent-tool-prev-nl");
    const nextBtn = page.getByTestId("agent-tool-next-nl");

    // Should be disabled initially (no NL query yet)
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();
  });

  test("export buttons show correct tooltips", async ({ page }) => {
    const exportJsonBtn = page.getByTestId("agent-tool-export-json");
    const exportMdBtn = page.getByTestId("agent-tool-export-markdown");
    const exportCsvBtn = page.getByTestId("agent-tool-export-csv");

    // Check tooltips
    await expect(exportJsonBtn).toHaveAttribute(
      "title",
      "Export last finance summary (if present) or full thread"
    );

    await expect(exportMdBtn).toHaveAttribute(
      "title",
      "Export last finance summary (if present) or full thread"
    );

    await expect(exportCsvBtn).toHaveAttribute(
      "title",
      "Exports results from your last natural-language search"
    );
  });
});
