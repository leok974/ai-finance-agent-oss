import { test, expect } from "@playwright/test";

test.describe("Google OAuth", () => {
  test("Google button redirects to Google Accounts", async ({ page }) => {
    await page.goto("/");

    const btn = page.getByTestId("btn-google");
    await expect(btn).toBeVisible();

    // Click and wait for navigation
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      btn.click(),
    ]);

    await popup.waitForLoadState("domcontentloaded");
    const url = popup.url();

    // Verify we're on Google OAuth
    expect(url).toContain("accounts.google.com");
  });

  test("GitHub button is hidden when disabled", async ({ page }) => {
    await page.goto("/");

    // GitHub button should not exist when VITE_ENABLE_GITHUB_OAUTH=0
    const githubBtn = page.getByTestId("btn-github");
    await expect(githubBtn).not.toBeVisible();
  });

  test("prod shows only Google (no local auth)", async ({ page }) => {
    await page.goto("/");

    // Should have Google button
    await expect(page.getByTestId("btn-google")).toBeVisible();

    // Should NOT have local auth elements
    await expect(page.getByText("Register")).toHaveCount(0);
    await expect(page.getByText("Forgot?")).toHaveCount(0);
    await expect(page.getByPlaceholder(/email/i)).toHaveCount(0);
    await expect(page.getByPlaceholder(/password/i)).toHaveCount(0);
  });
});
