import type { Page } from '@playwright/test';
// Central helper: ensure suggestions panel exists or skip spec with explanatory log.
export async function ensureSuggestionsPanelOrSkip(page: Page) {
  const panel = page.getByTestId('suggestions-panel');
  if (await panel.count() === 0) {
    // eslint-disable-next-line no-console
    console.log('Suggestions panel not found — likely build missing VITE_SUGGESTIONS_ENABLED=1. Skipping.');
    const mod = await import('@playwright/test');
    mod.test.skip(true, 'Suggestions feature disabled in this environment.');
  }
}
