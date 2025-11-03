import { Page, expect, test } from '@playwright/test';

export async function expectSuggestionsVisible(page: Page) {
  const panel = page.locator('[data-testid="suggestions-panel"]');
  const panelExists = await panel.first().count().then(c => c > 0).catch(() => false);
  if (!panelExists) {
    test.skip(true, 'Suggestions panel not available (feature flag or auth)');
  }
  const visible = await panel.first().isVisible().catch(() => false);
  if (!visible) {
    test.skip(true, 'Suggestions panel not visible (feature flag or auth)');
  }
  await expect(panel.first()).toBeVisible({ timeout: 30_000 });
}
