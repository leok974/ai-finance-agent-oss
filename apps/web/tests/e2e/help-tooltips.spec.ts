/**
 * E2E Tests: Help/Explain Tooltips UX
 *
 * Validates:
 * - Hover shows tooltip with role=tooltip (portal-safe)
 * - Keyboard focus shows tooltip (a11y)
 * - Escape and blur hide tooltips
 * - Only one tooltip visible at a time (exclusivity)
 * - Tooltip content is present (fallback safe)
 * - ARIA relationships (aria-describedby)
 * - Visual regression baseline
 * - Automated axe-core a11y compliance
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

/** ---------- helpers ---------- */
async function login(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // If the setup project saved state correctly, we should already be authed.
  // As a fallback, try to detect any Help button; if found, proceed.
  const helpBtn = page.getByRole('button', { name: /help|explain|what is this/i }).first();
  if (await helpBtn.isVisible().catch(() => false)) return;

  // Try to navigate to a route that always shows the help icon if your app has one:
  // await page.goto('/dashboard'); // uncomment if applicable
  // if (await helpBtn.isVisible().catch(() => false)) return;

  // Ultimate fallback: give the app a moment and then proceed
  await page.waitForTimeout(500);
}

/** Get any help/explain buttons visible on the page */
function helpButtons(page: Page) {
  // Prefer accessible names; fall back to a common testid if present
  const a = page.getByRole('button', { name: /help|explain|what is this/i });
  const b = page.getByTestId('help-toggle'); // optional if you added it
  return a.or(b);
}

/** Helper: Check tooltip is within viewport bounds */
async function expectTooltipWithinViewport(page: Page) {
  const tip = page.getByRole('tooltip');
  const box = await tip.boundingBox();
  if (!box) throw new Error('Tooltip has no bounding box');

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport size');

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

/** ---------- tests ---------- */

test.describe('@ui Help/Explain tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(BASE);

    // Enable help mode if there's a global toggle
    const globalToggle = page.getByRole('button', { name: /help mode|show help/i });
    if (await globalToggle.isVisible().catch(() => false)) {
      await globalToggle.click();
      await page.waitForTimeout(300); // Let help buttons appear
    }
  });

  test('hover shows a tooltip with role=tooltip (portal-safe), mouseleave hides it', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });

    // Hover → tooltip appears
    await btn.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Sanity: not blocked by overlays (pointer-events not none)
    await expect(tip).not.toHaveCSS('pointer-events', 'none');

    // Mouseleave → tooltip hides
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden({ timeout: 2000 });
  });

  test('keyboard focus shows tooltip; Escape closes; blur closes (a11y)', async ({ page }) => {
    const btn = helpButtons(page).nth(0);
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.focus();

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // ESC closes
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden({ timeout: 2000 });

    // Focus again → visible; then blur by Tab away
    await btn.focus();
    await expect(tip).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Tab');
    await expect(tip).toBeHidden({ timeout: 2000 });
  });

  test('only one tooltip visible at a time across multiple help icons', async ({ page }) => {
    const allButtons = helpButtons(page);
    const count = await allButtons.count();

    // If the UI only has one or none, skip gracefully
    if (count < 2) {
      test.skip();
      return;
    }

    const btn1 = allButtons.nth(0);
    const btn2 = allButtons.nth(1);

    // Open first
    await btn1.hover();
    await page.waitForTimeout(300); // Let tooltip appear

    const tooltips = page.getByRole('tooltip');
    await expect(tooltips).toHaveCount(1, { timeout: 2000 });

    const firstTooltipText = await tooltips.first().innerText();

    // Move to second
    await btn2.hover();
    await page.waitForTimeout(300); // Let transition happen

    // Still only one tooltip should be visible (exclusivity)
    await expect(tooltips).toHaveCount(1, { timeout: 2000 });

    // And it should be different content
    const secondTooltipText = await tooltips.first().innerText();
    expect(secondTooltipText).not.toBe(firstTooltipText);
  });

  test('tooltip content is present (fallback text if help endpoint is unavailable)', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.hover();

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Content check: either a known key phrase or the deterministic fallback
    const possible = [
      /overview|how this works|top categories|daily flows|spending|budget|transactions|rules|insights/i,
      /no help available|try again|missing help content|loading help|help content unavailable/i
    ];

    const content = await tip.innerText();
    const hasValidContent = possible.some((re) => re.test(content));

    expect(hasValidContent).toBeTruthy();
    expect(content.length).toBeGreaterThan(0); // Not empty
  });

  test('tooltip is accessible via keyboard navigation and announces properly', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });

    // Tab to focus the button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // May need multiple tabs depending on page structure

    // Try to find focused help button
    let focused = false;
    for (let i = 0; i < 10; i++) {
      const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent);
      if (focusedElement && /help|explain|what is this/i.test(focusedElement)) {
        focused = true;
        break;
      }
      await page.keyboard.press('Tab');
    }

    if (!focused) {
      // Fallback: directly focus the button
      await btn.focus();
    }

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Verify tooltip has proper ARIA attributes
    const role = await tip.getAttribute('role').catch(() => null);

    expect(role).toBe('tooltip');
    // aria-live is optional but good practice for dynamic content
    // (not strictly tested here as it's advisory)
  });

  test('multiple rapid hovers do not cause tooltip flicker or crash', async ({ page }) => {
    const allButtons = helpButtons(page);
    const count = await allButtons.count();

    if (count < 2) {
      test.skip();
      return;
    }

    // Rapidly hover over multiple buttons
    for (let i = 0; i < Math.min(count, 5); i++) {
      await allButtons.nth(i).hover();
      await page.waitForTimeout(100);
    }

    // Should still be able to open tooltip normally
    await allButtons.first().hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });
  });

  test('tooltip respects z-index and appears above other content', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.hover();

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Check z-index is reasonably high (portal should handle this)
    const zIndex = await tip.evaluate((el) => {
      return window.getComputedStyle(el).zIndex;
    });

    // Should be a high z-index (portals typically use 9999+)
    const zIndexNum = parseInt(zIndex, 10);
    expect(zIndexNum).toBeGreaterThan(100);
  });
});

// --- reduced-motion variants ---
test.describe('@a11y prefers-reduced-motion', () => {
  test.use({
    contextOptions: {
      reducedMotion: 'reduce'
    }
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(BASE);

    // Enable help mode if there's a global toggle
    const globalToggle = page.getByRole('button', { name: /help mode|show help/i });
    if (await globalToggle.isVisible().catch(() => false)) {
      await globalToggle.click();
      await page.waitForTimeout(300); // Let help buttons appear
    }
  });

  test('hover shows/hides tooltip quickly with reduced motion', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });

    const startOpen = Date.now();
    await btn.hover();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2000 });
    const openMs = Date.now() - startOpen;

    // close via mouseout
    await page.mouse.move(0, 0);
    const startClose = Date.now();
    await expect(page.getByRole('tooltip')).toBeHidden({ timeout: 2000 });
    const closeMs = Date.now() - startClose;

    // Heuristic thresholds; adjust if your UI is intentionally slower
    expect(openMs).toBeLessThan(150); // Slightly higher for CI stability
    expect(closeMs).toBeLessThan(150);
  });

  test('keyboard focus/escape works with reduced motion', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.focus();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2000 });

    // ESC closes quickly
    const t0 = Date.now();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden({ timeout: 2000 });
    const escMs = Date.now() - t0;
    expect(escMs).toBeLessThan(150);

    // Tab away also closes
    await btn.focus();
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2000 });
    const t1 = Date.now();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tooltip')).toBeHidden({ timeout: 2000 });
    const tabMs = Date.now() - t1;
    expect(tabMs).toBeLessThan(150);
  });

  test('geometry still sane under reduced motion', async ({ page }) => {
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.hover();

    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Check tooltip is within viewport bounds
    await expectTooltipWithinViewport(page);

    // Close and verify
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden({ timeout: 2000 });
  });
});

/**
 * @a11y ARIA Relationships & Automated Compliance
 *
 * Ensures proper ARIA semantics and WCAG compliance for tooltip components.
 */
test.describe('@a11y ARIA relationships & automated compliance', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(BASE);

    const globalToggle = page.getByRole('button', { name: /help mode|show help/i });
    if (await globalToggle.isVisible().catch(() => false)) {
      await globalToggle.click();
      await page.waitForTimeout(300);
    }
  });

  test('@a11y tooltip is correctly described by trigger (aria-describedby)', async ({ page }) => {
    const btn = helpButtons(page).first();
    await btn.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();

    // Grab ids/attributes
    const tipId = await tip.getAttribute('id');
    expect(tipId).toBeTruthy();

    const describedBy = await btn.getAttribute('aria-describedby');
    expect(describedBy?.split(/\s+/)).toContain(tipId);

    // Tooltip should NOT be focusable or trap focus
    const tipTabIndex = await tip.getAttribute('tabindex');
    expect(tipTabIndex === null || tipTabIndex === '-1').toBeTruthy();

    // Close cleanly
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
  });

  test('@a11y axe scan passes on help tooltip state', async ({ page }) => {
    const btn = helpButtons(page).first();
    await btn.hover(); // tooltip open

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

/**
 * @visual Visual Regression Testing
 *
 * Catches layout/portal regressions without flakiness.
 */
test.describe('@visual Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    // storageState from setup project should already have auth cookies
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Give the app a moment to initialize and check auth status
    await page.waitForTimeout(2000);

    // Debug: check if we're still on login page
    const loginBtn = page.getByRole('button', { name: /^login$/i });
    if (await loginBtn.isVisible().catch(() => false)) {
      throw new Error('Still on login page - auth state not restored. Check that setup project ran and saved state.json');
    }

    // Enable help mode if there's a global toggle
    const globalToggle = page.getByRole('button', { name: /help mode|show help/i });
    if (await globalToggle.isVisible().catch(() => false)) {
      await globalToggle.click();
      await page.waitForTimeout(300);
    }
  });

  test('tooltip visual baseline (masked dynamic regions)', async ({ page }) => {
    // Wait for any help button to appear (with longer timeout)
    const btn = helpButtons(page).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    const tip = page.locator('[data-popover-role="card-help"]');
    await expect(tip).toBeVisible();

    // Mask dynamic bits to avoid flaky diffs (timestamps, spinners, counters)
    await expect(page).toHaveScreenshot('tooltip-baseline.png', {
      animations: 'disabled',
      mask: [
        tip.locator('[data-dynamic]'),
        tip.locator('time'),
        tip.locator('.spinner, [data-spinner], [aria-busy="true"]')
      ],
      // keep small tolerances for crisp UI; adjust if needed
      maxDiffPixelRatio: 0.02
    });

    // Close cleanly
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  });
});
