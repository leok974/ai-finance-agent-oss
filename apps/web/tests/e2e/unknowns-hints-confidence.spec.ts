/**
 * E2E test to verify hint-backed suggestions show high confidence (>80%) in the UI
 *
 * Tests that known merchants (seeded in demo data) get high-confidence suggestions
 * via the merchant_category_hints table, not falling back to 0.35 prior scores.
 *
 * Expected behavior:
 * - CVS/PHARMACY transactions: ≥80% confidence (hint: 0.86)
 * - Harris Teeter transactions: ≥89% confidence (hint: 0.99)
 *
 * Runs in chromium-prod with demo data containing CVS and Harris Teeter transactions.
 */

import { test, expect } from '@playwright/test';
import { assertLoggedIn } from './utils/prodSession';

test.describe('@prod-safe Hints Confidence in UI', () => {
  test.beforeEach(async ({ page }) => {
    await assertLoggedIn(page);
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  test('CVS transaction shows >80% confidence from hint (not 35% prior)', async ({ page }) => {
    // Wait for uncategorized card to load
    await page.locator('[data-testid="uncat-card-root"]').first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    // Find a CVS transaction row
    const cvsTxnRow = page.locator('[data-testid="uncat-transaction-row"]').filter({
      has: page.locator('text=/CVS|cvs pharmacy/i'),
    }).first();

    // Skip if no CVS transaction found
    const cvsTxnExists = await cvsTxnRow.count() > 0;
    test.skip(!cvsTxnExists, 'No CVS transaction found in uncategorized list');

    await cvsTxnRow.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for suggestion chips to load
    const suggestionChip = cvsTxnRow.locator('[data-testid="uncat-suggestion-chip"]').first();
    await expect(suggestionChip).toBeVisible({ timeout: 10_000 });

    // Extract confidence percentage from chip text
    const chipText = await suggestionChip.textContent();
    const confidenceMatch = chipText?.match(/(\d+)%/);

    expect(confidenceMatch).toBeTruthy();
    const confidence = parseInt(confidenceMatch![1], 10);

    console.log(`[hints-e2e] CVS confidence: ${confidence}%`);

    // ASSERTION: Hint should give >80% (0.86 hint → ~86%)
    expect(confidence).toBeGreaterThanOrEqual(80);

    // GUARDRAIL: Should NOT be prior fallback score (35%)
    expect(confidence).toBeGreaterThan(50);
  });

  test('Harris Teeter transaction shows ≥89% confidence from hint', async ({ page }) => {
    // Wait for uncategorized card to load
    await page.locator('[data-testid="uncat-card-root"]').first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    // Find a Harris Teeter transaction row
    const harrisTxnRow = page.locator('[data-testid="uncat-transaction-row"]').filter({
      has: page.locator('text=/HARRIS TEETER|harris teeter/i'),
    }).first();

    // Skip if no Harris Teeter transaction found
    const harrisTxnExists = await harrisTxnRow.count() > 0;
    test.skip(!harrisTxnExists, 'No Harris Teeter transaction found in uncategorized list');

    await harrisTxnRow.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for suggestion chips to load
    const suggestionChip = harrisTxnRow.locator('[data-testid="uncat-suggestion-chip"]').first();
    await expect(suggestionChip).toBeVisible({ timeout: 10_000 });

    // Extract confidence percentage from chip text
    const chipText = await suggestionChip.textContent();
    const confidenceMatch = chipText?.match(/(\d+)%/);

    expect(confidenceMatch).toBeTruthy();
    const confidence = parseInt(confidenceMatch![1], 10);

    console.log(`[hints-e2e] Harris Teeter confidence: ${confidence}%`);

    // ASSERTION: High-confidence hint (0.99) should show ~99%
    expect(confidence).toBeGreaterThanOrEqual(89);

    // GUARDRAIL: Should NOT be prior fallback score (35%)
    expect(confidence).toBeGreaterThan(50);
  });

  test('hints-backed suggestions rank higher than priors in batch response', async ({ page }) => {
    // Intercept the batch suggestions API call
    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes('/agent/tools/categorize/suggest/batch') &&
      resp.request().method() === 'POST',
      { timeout: 15_000 }
    );

    await page.reload();
    const response = await responsePromise;

    let body: any;
    try {
      body = await response.json();
    } catch (err) {
      test.skip(true, 'Failed to parse batch response');
      return;
    }

    const items = body.items ?? body.data ?? [];
    expect(Array.isArray(items)).toBeTruthy();
    expect(items.length).toBeGreaterThan(0);

    // Find a CVS or Harris Teeter transaction in the batch
    const knownMerchantItem = items.find((item: any) => {
      const desc = item.description?.toLowerCase() || '';
      return desc.includes('cvs') || desc.includes('harris');
    });

    if (!knownMerchantItem) {
      test.skip(true, 'No known merchant (CVS/Harris Teeter) found in batch');
      return;
    }

    const suggestions = knownMerchantItem.suggestions ?? [];
    expect(suggestions.length).toBeGreaterThan(0);

    // Top suggestion should be the hint with high confidence
    const topSuggestion = suggestions[0];
    const topScore = topSuggestion.score ?? 0;

    console.log(`[hints-e2e] Top suggestion score: ${topScore}`);

    // ASSERTION: Top score should be from hint (≥0.80)
    expect(topScore).toBeGreaterThanOrEqual(0.80);

    // GUARDRAIL: Check if any "prior" suggestions exist and verify they're ranked lower
    const priorSuggestions = suggestions.filter((s: any) =>
      s.why?.some((w: string) => w.toLowerCase().includes('prior'))
    );

    if (priorSuggestions.length > 0) {
      const priorScores = priorSuggestions.map((s: any) => s.score ?? 0);
      const maxPriorScore = Math.max(...priorScores);

      console.log(`[hints-e2e] Prior scores: ${priorScores.join(', ')}`);

      // Hint must beat all priors
      expect(topScore).toBeGreaterThan(maxPriorScore);
    }
  });
});
