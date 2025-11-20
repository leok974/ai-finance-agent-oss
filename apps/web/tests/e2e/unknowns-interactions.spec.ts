import { test, expect } from '@playwright/test';

/**
 * Runs in prod (chromium-prod) with:
 *   BASE_URL=https://app.ledger-mind.org
 *   USE_DEV=0
 *   PW_SKIP_WS=1
 * and storageState already containing a logged-in session.
 */

async function getUncatRowCount(page: import('@playwright/test').Page) {
  const rows = page.locator('[data-testid="uncat-transaction-row"]');

  // First wait for the card root to exist at all (layout mounted).
  await page.locator('[data-testid="uncat-card-root"]').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  }).catch(() => {
    // If the card itself never appears, we clearly have no uncategorized section.
  });

  let rowCount = 0;

  try {
    // Then wait a bit for at least one row to show up, if any exist.
    await rows.first().waitFor({
      state: 'visible',
      timeout: 12_000,
    });
    rowCount = await rows.count();
  } catch {
    // Timeout → treat as zero; maybe there truly are none.
    rowCount = await rows.count();
  }

  console.log('[unknowns-e2e] uncategorized rowCount =', rowCount);
  return { rows, rowCount };
}

test('@prod unknowns suggestions are loaded from backend for uncategorized card', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');

  const { rowCount } = await getUncatRowCount(page);
  test.skip(rowCount === 0, 'No uncategorized transactions visible in UI after waiting');

  // Reload to trigger suggestions and wait for the batch API call.
  const [response] = await Promise.all([
    page.waitForResponse((resp) =>
      resp.url().includes('/agent/tools/categorize/suggest/batch') &&
      resp.request().method() === 'POST'
    ),
    page.reload(),
  ]);

  const body: any = await response.json();
  const items = body.items ?? body.data ?? [];

  expect(Array.isArray(items)).toBeTruthy();
  expect(items.length).toBeGreaterThan(0);

  const first = items[0] ?? {};

  // Validate the structure has txn and suggestions array
  expect(first).toMatchObject({
    txn: expect.any(Number),
    suggestions: expect.any(Array),
  });

  if (first.suggestions && first.suggestions.length > 0) {
    const firstSuggestion = first.suggestions[0];

    if ('category_slug' in firstSuggestion) {
      expect(typeof firstSuggestion.category_slug).toBe('string');
    }
    if ('label' in firstSuggestion) {
      expect(typeof firstSuggestion.label).toBe('string');
    }

    const score = firstSuggestion.score ?? firstSuggestion.confidence;
    expect(typeof score).toBe('number');

    if ('why' in firstSuggestion && firstSuggestion.why != null) {
      expect(Array.isArray(firstSuggestion.why)).toBe(true);
    }
  }
});

test('@prod uncategorized suggestion chips are interactive', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');

  const { rows, rowCount } = await getUncatRowCount(page);
  test.skip(rowCount === 0, 'No uncategorized transactions visible in UI after waiting');

  const firstRow = rows.first();
  const firstChip = firstRow.locator('[data-testid="uncat-suggestion-chip"]').first();

  await expect(firstChip).toBeVisible();

  // Click should be wired to a real handler (apply suggestion), not a dead placeholder.
  await firstChip.click();

  // Smoke check: the card still exists after clicking.
  await expect(page.locator('[data-testid="uncat-card-root"]')).toBeVisible();
});
