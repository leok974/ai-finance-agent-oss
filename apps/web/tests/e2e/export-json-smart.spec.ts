import { expect, test } from "@playwright/test";

test.describe("Smart JSON export", () => {
  test("exports last finance reply as structured JSON", async ({ page }) => {
    await page.goto("/");

    // Wait for auth/load
    await page.waitForTimeout(1000);

    // Run "Month summary"
    await page.getByRole("button", { name: /Month summary/i }).click();

    // Wait for summary to appear
    await page.waitForTimeout(2000);

    // Then "Deeper breakdown" so last is deep-dive
    const deeperBtn = page.getByTestId("action-chip-deeper-breakdown");
    if (await deeperBtn.isVisible()) {
      await deeperBtn.click();
      await page.waitForTimeout(2000);
    }

    // Click Export JSON
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-json-smart").click(),
    ]);

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/finance-summary-\d{4}-\d{2}-(quick|deep)-/);

    const path = await download.path();
    const fs = await import("fs/promises");
    const contentStr = await fs.readFile(path!, "utf-8");
    const content = JSON.parse(contentStr);

    // Validate structure
    expect(content.version).toBe("1.0");
    expect(content.kind).toMatch(/finance_(quick_recap|deep_dive)/);
    expect(content.month).toMatch(/\d{4}-\d{2}/);
    expect(content.generated_at).toBeTruthy();

    // Validate summary has raw numbers (not formatted strings)
    expect(typeof content.summary.income).toBe("number");
    expect(typeof content.summary.spend).toBe("number");
    expect(typeof content.summary.net).toBe("number");

    // Validate source
    expect(content.source.session_id).toBeTruthy();
    expect(content.source.message_id).toBeTruthy();

    // Security: ensure no email or cookies
    const jsonStr = JSON.stringify(content);
    expect(jsonStr).not.toContain("email");
    expect(jsonStr).not.toContain("cookie");
  });

  test("exports full thread when no finance messages", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Send a regular message (not finance)
    const composer = page.locator("#chat-composer");
    await composer.fill("Hello");
    await composer.press("Enter");
    await page.waitForTimeout(1500);

    // Click Export JSON
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-json-smart").click(),
    ]);

    const filename = download.suggestedFilename();
    // Should be regular thread export filename
    expect(filename).toMatch(/finance-agent-chat-.*\.json/);

    const path = await download.path();
    const fs = await import("fs/promises");
    const contentStr = await fs.readFile(path!, "utf-8");
    const content = JSON.parse(contentStr);
    // Should be an array of messages (full thread format)
    expect(Array.isArray(content)).toBe(true);
  });

  test("disables export button when no messages", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Clear any existing messages
    const clearBtn = page.getByTestId("btn-clear");
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.getByRole("button", { name: "Clear chat" }).click();
      await page.waitForTimeout(500);
    }

    // Export button should be disabled
    await expect(page.getByTestId("export-json-smart")).toBeDisabled();
  });

  test("prefers latest finance message when multiple exist", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Run month summary (creates quick recap)
    await page.getByRole("button", { name: /Month summary/i }).click();
    await page.waitForTimeout(2000);

    // Then deeper breakdown (creates deep dive)
    const deeperBtn = page.getByTestId("action-chip-deeper-breakdown");
    if (await deeperBtn.isVisible()) {
      await deeperBtn.click();
      await page.waitForTimeout(2000);
    }

    // Export should get the deep dive (last one)
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-json-smart").click(),
    ]);

    const path = await download.path();
    const fs = await import("fs/promises");
    const contentStr = await fs.readFile(path!, "utf-8");
    const content = JSON.parse(contentStr);
    expect(content.kind).toBe("finance_deep_dive");

    // Deep dive should have categories
    expect(content.categories).toBeDefined();
  });

  test("tooltip shows correct description", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    const exportBtn = page.getByTestId("export-json-smart");
    await exportBtn.hover();

    // Check tooltip text
    await expect(exportBtn).toHaveAttribute(
      "title",
      "Export last reply if it's a finance summary; otherwise export full thread"
    );
  });
});
