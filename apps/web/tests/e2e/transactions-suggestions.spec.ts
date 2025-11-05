/**
 * End-to-end test for ML suggestions in TransactionsPanel
 * Tests the complete user flow: view suggestions → accept → verify update
 */

import { test, expect } from "@playwright/test";

// Use environment variable for test transaction ID (from seed data)
const TEST_TXN_ID = process.env.E2E_TXN_ID || "999001";

test.describe("ML Suggestions in TransactionsPanel", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to transactions page
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
  });

  test("shows ML suggestion chips under uncategorized transaction", async ({
    page,
    request,
  }) => {
    // Prime suggestions via API to ensure event_id is present
    const primeResponse = await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [TEST_TXN_ID],
        top_k: 3,
        mode: "auto",
      },
    });

    expect(primeResponse.ok()).toBeTruthy();
    const primeData = await primeResponse.json();
    expect(primeData.items).toBeDefined();
    expect(primeData.items.length).toBeGreaterThan(0);

    // Reload page to see suggestions
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Look for suggestion chips (should have confidence badges)
    const suggestionChips = page.locator('[data-testid="suggestion-chip"]');
    await expect(suggestionChips.first()).toBeVisible({ timeout: 5000 });

    // Verify chips have confidence percentages
    const chipText = await suggestionChips.first().textContent();
    expect(chipText).toMatch(/\d+%/); // Should contain percentage
  });

  test("accepts suggestion and updates transaction category", async ({
    page,
    request,
  }) => {
    // Prime suggestions
    const primeResponse = await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [TEST_TXN_ID],
        top_k: 3,
        mode: "auto",
      },
    });

    expect(primeResponse.ok()).toBeTruthy();

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Find first suggestion chip
    const firstChip = page
      .locator('[data-testid="suggestion-chip"]')
      .first();
    await expect(firstChip).toBeVisible({ timeout: 5000 });

    // Get the suggested category name before accepting
    const suggestedCategory = await firstChip
      .locator('[data-testid="suggestion-label"]')
      .textContent();

    // Hover to reveal accept button
    await firstChip.hover();

    // Click accept button (check icon)
    const acceptButton = firstChip.locator('button[aria-label*="Accept"]');
    await acceptButton.click();

    // Wait for success toast
    await expect(page.getByText(/Category Applied/i)).toBeVisible({
      timeout: 3000,
    });

    // Verify transaction row now shows the category
    // (suggestion row should disappear after categorization)
    const txnRow = page.locator(`tr:has-text("${TEST_TXN_ID}")`).first();
    if (suggestedCategory) {
      await expect(txnRow).toContainText(suggestedCategory, { timeout: 3000 });
    }

    // Suggestion chips should no longer be visible
    await expect(firstChip).not.toBeVisible({ timeout: 3000 });
  });

  test("rejects suggestion without updating category", async ({
    page,
    request,
  }) => {
    // Use a different test transaction for reject flow
    const REJECT_TXN_ID = "999002";

    // Prime suggestions
    await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [REJECT_TXN_ID],
        top_k: 3,
        mode: "auto",
      },
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Find suggestion chip for the test transaction
    const chip = page.locator('[data-testid="suggestion-chip"]').first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    // Hover to reveal reject button
    await chip.hover();

    // Click reject button (X icon)
    const rejectButton = chip.locator('button[aria-label*="Reject"]');
    await rejectButton.click();

    // Feedback is sent silently (no toast expected for reject)
    // Chip should remain visible (transaction still uncategorized)
    await page.waitForTimeout(1000); // Brief wait for API call

    // Transaction should still show no category
    const txnRow = page.locator(`tr:has-text("${REJECT_TXN_ID}")`).first();
    const categoryCell = txnRow.locator("td").nth(3); // Category column
    await expect(categoryCell).toContainText("—"); // Empty category placeholder
  });

  test("handles multiple uncategorized transactions with suggestions", async ({
    page,
    request,
  }) => {
    // Prime suggestions for multiple transactions
    const txnIds = ["999001", "999002", "999003"];

    await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: txnIds,
        top_k: 3,
        mode: "auto",
      },
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should see multiple suggestion rows
    const allChips = page.locator('[data-testid="suggestion-chip"]');
    await expect(allChips.first()).toBeVisible({ timeout: 5000 });

    const chipCount = await allChips.count();
    expect(chipCount).toBeGreaterThan(0);

    // Each uncategorized transaction should have suggestions
    // (up to 3 chips per transaction)
  });

  test("shows loading state during suggestion acceptance", async ({
    page,
    request,
  }) => {
    // Prime suggestions
    await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [TEST_TXN_ID],
        top_k: 3,
        mode: "auto",
      },
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    const firstChip = page
      .locator('[data-testid="suggestion-chip"]')
      .first();
    await expect(firstChip).toBeVisible({ timeout: 5000 });

    await firstChip.hover();
    const acceptButton = firstChip.locator('button[aria-label*="Accept"]');

    // Click accept
    await acceptButton.click();

    // Should briefly show loading spinner
    const loadingSpinner = page.locator('[role="status"]');
    await expect(loadingSpinner).toBeVisible({ timeout: 1000 });
  });

  test("handles API errors gracefully", async ({ page, context }) => {
    // Mock API failure
    await context.route("**/agent/tools/suggestions", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Suggestions should not appear
    const suggestionChips = page.locator('[data-testid="suggestion-chip"]');
    await expect(suggestionChips.first()).not.toBeVisible({ timeout: 3000 });

    // Page should still be functional (no crash)
    await expect(page.locator("table")).toBeVisible();
  });
});

test.describe("ML Suggestions API Integration", () => {
  test("suggestions endpoint returns candidates", async ({ request }) => {
    const response = await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [TEST_TXN_ID],
        top_k: 3,
        mode: "auto",
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);

    // Check first item structure
    const firstItem = data.items[0];
    expect(firstItem).toHaveProperty("txn_id");
    expect(firstItem).toHaveProperty("candidates");
    expect(firstItem).toHaveProperty("event_id");

    // Check candidate structure
    const firstCandidate = firstItem.candidates[0];
    expect(firstCandidate).toHaveProperty("label");
    expect(firstCandidate).toHaveProperty("confidence");
    expect(firstCandidate).toHaveProperty("reasons");
    expect(typeof firstCandidate.confidence).toBe("number");
    expect(firstCandidate.confidence).toBeGreaterThan(0);
    expect(firstCandidate.confidence).toBeLessThanOrEqual(1);
  });

  test("feedback endpoint accepts accept action", async ({ request }) => {
    // First get a suggestion to get event_id
    const suggestResponse = await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: [TEST_TXN_ID],
        top_k: 1,
        mode: "auto",
      },
    });

    expect(suggestResponse.ok()).toBeTruthy();
    const suggestData = await suggestResponse.json();
    const eventId = suggestData.items[0].event_id;

    // Send feedback
    const feedbackResponse = await request.post(
      "/agent/tools/suggestions/feedback",
      {
        data: {
          event_id: eventId,
          action: "accept",
          reason: "e2e_test_automation",
        },
      }
    );

    expect(feedbackResponse.ok()).toBeTruthy();
    const feedbackData = await feedbackResponse.json();
    expect(feedbackData).toHaveProperty("ok");
    expect(feedbackData.ok).toBe(true);
  });

  test("feedback endpoint accepts reject action", async ({ request }) => {
    const suggestResponse = await request.post("/agent/tools/suggestions", {
      data: {
        txn_ids: ["999002"],
        top_k: 1,
        mode: "auto",
      },
    });

    expect(suggestResponse.ok()).toBeTruthy();
    const suggestData = await suggestResponse.json();
    const eventId = suggestData.items[0].event_id;

    const feedbackResponse = await request.post(
      "/agent/tools/suggestions/feedback",
      {
        data: {
          event_id: eventId,
          action: "reject",
          reason: "e2e_test_automation",
        },
      }
    );

    expect(feedbackResponse.ok()).toBeTruthy();
    const feedbackData = await feedbackResponse.json();
    expect(feedbackData.ok).toBe(true);
  });
});
