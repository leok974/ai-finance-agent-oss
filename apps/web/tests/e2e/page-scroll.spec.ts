/**
 * page-scroll.spec.ts - Verify main page scrolling is not blocked by ChatDock CSS
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod Page scroll regression', () => {
  test('main page remains scrollable with ChatDock present', async ({ page }) => {
    await page.goto(`${BASE_URL}/?chat=1`);
    await page.waitForLoadState('networkidle');

    // Verify chat launcher is present (confirms ChatDock CSS is loaded)
    const launcher = page.getByTestId('lm-chat-launcher');
    await expect(launcher).toBeAttached();

    // DEBUG: Check what CSS files are loaded
    const cssFiles = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.map(link => link.getAttribute('href'));
    });
    console.log('Loaded CSS files:', cssFiles);

    // Get initial scroll position
    const initialScrollY = await page.evaluate(() => window.scrollY);

    // Get page height to verify it's scrollable
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    console.log(`Page height: ${pageHeight}, Viewport: ${viewportHeight}, Initial scroll: ${initialScrollY}`);

    // If page is taller than viewport, verify we can scroll
    if (pageHeight > viewportHeight) {
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, 500));

      // Wait a bit for scroll to complete
      await page.waitForTimeout(200);

      const scrolledY = await page.evaluate(() => window.scrollY);

      expect(scrolledY).toBeGreaterThan(initialScrollY);
      console.log(`Scrolled to: ${scrolledY}`);
    } else {
      // Page is not tall enough to scroll - verify overflow-y allows scrolling
      // NOTE: The shorthand 'overflow' property returns only the first value when axes differ
      // (e.g., "hidden" when overflow-x:hidden and overflow-y:auto), so we must check overflowY specifically
      const bodyStyles = await page.evaluate(() => {
        const computed = window.getComputedStyle(document.body);
        const inline = document.body.getAttribute('style') || '(none)';
        const classList = Array.from(document.body.classList);
        return {
          overflow: computed.overflow,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          inlineStyle: inline,
          classes: classList
        };
      });

      console.log(`Body overflow styles:`, bodyStyles);
      // Check overflowY specifically - this is what controls vertical scrolling
      expect(bodyStyles.overflowY).not.toBe('hidden');
      // overflowX can be 'hidden' (we explicitly set overflow-x to hidden for horizontal scroll lock)
      expect(['hidden', 'clip']).toContain(bodyStyles.overflowX);
    }
  });
});
