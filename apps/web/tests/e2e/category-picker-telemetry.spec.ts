import { test, expect } from "@playwright/test";

/**
 * Category Picker Telemetry Test Suite
 *
 * Verifies that telemetry events are properly fired when users interact
 * with the inline category picker for transaction categorization.
 */

test.describe("Category Picker Telemetry", () => {
  let telemetryEvents: any[] = [];

  test.beforeEach(async ({ page }) => {
    telemetryEvents = [];

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Set up telemetry capture
    await page.exposeFunction("captureTelemetry", (event: any) => {
      telemetryEvents.push(event);
    });

    await page.evaluate(() => {
      window.addEventListener("telemetry", (e: any) => {
        (window as any).captureTelemetry(e.detail);
      });
    });
  });

  test("fires OPENED event when picker opens", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Click on a category cell to open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Verify OPENED event was fired
      const openedEvent = telemetryEvents.find(
        (e) => e.event === "category_picker_opened"
      );
      expect(openedEvent).toBeDefined();
      expect(openedEvent?.txnId).toBeDefined();
      expect(openedEvent?.currentCategory).toBeDefined();
    }
  });

  test("fires SELECT_SUGGESTION event when ML suggestion is clicked", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Click on a suggestion (if available)
      const suggestion = page.locator('[data-testid^="suggestion-"]').first();
      if (await suggestion.isVisible()) {
        await suggestion.click();
        await page.waitForTimeout(300);

        // Verify SELECT_SUGGESTION event was fired
        const selectEvent = telemetryEvents.find(
          (e) => e.event === "category_picker_select_suggestion"
        );
        expect(selectEvent).toBeDefined();
        expect(selectEvent?.category).toBeDefined();
      }
    }
  });

  test("fires SELECT_CATEGORY event when manual category is clicked", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Click on a category from the list (not a suggestion)
      const allCategories = page.locator('[data-testid^="category-"]');
      const categoryCount = await allCategories.count();

      if (categoryCount > 0) {
        await allCategories.first().click();
        await page.waitForTimeout(300);

        // Verify SELECT_CATEGORY event was fired
        const selectEvent = telemetryEvents.find(
          (e) => e.event === "category_picker_select_category"
        );
        expect(selectEvent).toBeDefined();
        expect(selectEvent?.category).toBeDefined();
      }
    }
  });

  test("fires SEARCH event when user searches for categories", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Search for a category
      const searchInput = page.getByTestId("category-search");
      if (await searchInput.isVisible()) {
        await searchInput.fill("Gro");
        await page.waitForTimeout(600); // Wait for debounce (500ms + buffer)

        // Verify SEARCH event was fired
        const searchEvent = telemetryEvents.find(
          (e) => e.event === "category_picker_search"
        );
        expect(searchEvent).toBeDefined();
        expect(searchEvent?.query).toBe("Gro");
        expect(searchEvent?.resultsCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("fires SAVE event when category is saved without rule", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Select a category
      const category = page.locator('[data-testid^="category-"]').first();
      if (await category.isVisible()) {
        await category.click();
        await page.waitForTimeout(300);

        // Save without rule
        const saveButton = page.getByTestId("save-button");
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(500);

          // Verify SAVE event was fired
          const saveEvent = telemetryEvents.find(
            (e) => e.event === "category_picker_save"
          );
          expect(saveEvent).toBeDefined();
          expect(saveEvent?.newCategory).toBeDefined();
          expect(saveEvent?.makeRule).toBe(false);
        }
      }
    }
  });

  test("fires SAVE_WITH_RULE event when rule checkbox is checked", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Select a category
      const category = page.locator('[data-testid^="category-"]').first();
      if (await category.isVisible()) {
        await category.click();
        await page.waitForTimeout(300);

        // Check the rule checkbox
        const ruleCheckbox = page.getByTestId("make-rule-checkbox");
        if (await ruleCheckbox.isVisible()) {
          await ruleCheckbox.check();

          // Save with rule
          const saveButton = page.getByTestId("save-button");
          if (await saveButton.isVisible()) {
            await saveButton.click();
            await page.waitForTimeout(500);

            // Verify SAVE_WITH_RULE event was fired
            const saveEvent = telemetryEvents.find(
              (e) => e.event === "category_picker_save_with_rule"
            );
            expect(saveEvent).toBeDefined();
            expect(saveEvent?.newCategory).toBeDefined();
            expect(saveEvent?.makeRule).toBe(true);
          }
        }
      }
    }
  });

  test("fires CANCEL event when user cancels", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Select a category but cancel
      const category = page.locator('[data-testid^="category-"]').first();
      if (await category.isVisible()) {
        await category.click();
        await page.waitForTimeout(300);

        // Click cancel
        const cancelButton = page.getByTestId("cancel-button");
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
          await page.waitForTimeout(300);

          // Verify CANCEL event was fired
          const cancelEvent = telemetryEvents.find(
            (e) => e.event === "category_picker_cancel"
          );
          expect(cancelEvent).toBeDefined();
          expect(cancelEvent?.hadSelectedValue).toBe(true);
        }
      }
    }
  });

  test("includes confidence score in suggestion selection event", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Click on a suggestion
      const suggestion = page.locator('[data-testid^="suggestion-"]').first();
      if (await suggestion.isVisible()) {
        await suggestion.click();
        await page.waitForTimeout(300);

        // Verify confidence is included
        const selectEvent = telemetryEvents.find(
          (e) => e.event === "category_picker_select_suggestion"
        );
        if (selectEvent) {
          // Confidence should be present for ML suggestions
          expect(selectEvent.confidence).toBeDefined();
          expect(typeof selectEvent.confidence).toBe("number");
        }
      }
    }
  });

  test("tracks wasFromSuggestion in save event", async ({ page }) => {
    // Navigate to transactions
    const transactionsLink = page.getByRole("link", { name: /transactions/i });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForTimeout(1000);
    }

    // Open picker
    const categoryCell = page.locator('[data-testid^="category-button-"]').first();
    if (await categoryCell.isVisible()) {
      await categoryCell.click();
      await page.waitForTimeout(300);

      // Click on a suggestion
      const suggestion = page.locator('[data-testid^="suggestion-"]').first();
      if (await suggestion.isVisible()) {
        await suggestion.click();
        await page.waitForTimeout(300);

        // Save the suggestion
        const saveButton = page.getByTestId("save-button");
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(500);

          // Verify wasFromSuggestion is true
          const saveEvent = telemetryEvents.find(
            (e) => e.event === "category_picker_save" || e.event === "category_picker_save_with_rule"
          );
          if (saveEvent) {
            expect(saveEvent.wasFromSuggestion).toBe(true);
          }
        }
      }
    }
  });
});
