# Accessibility Testing Guide

## Overview

Comprehensive accessibility testing infrastructure for LedgerMind using Playwright and axe-core.

## Test Categories

### 1. 🎯 Reduced Motion Tests (`@a11y` tag)

Tests that verify components work correctly with `prefers-reduced-motion: reduce` user preference.

**Configuration:**
```typescript
test.use({ contextOptions: { reducedMotion: 'reduce' } });
```

**What We Test:**
- ✅ Tooltips open/close quickly (<150ms) with reduced motion enabled
- ✅ Keyboard interactions (ESC, Tab) remain fast
- ✅ Geometry/positioning stays correct without animations
- ✅ No long animation delays that violate user preferences

**Why It Matters:**
- Users with vestibular disorders need reduced motion
- WCAG 2.1 Level AAA Success Criterion 2.3.3 (Animation from Interactions)
- Common regression: components rely on animation timings for state management

### 2. 🔗 ARIA Relationship Tests

Tests that validate proper ARIA semantics and relationships.

**What We Test:**
- ✅ `aria-describedby` correctly links trigger button to tooltip
- ✅ Tooltip has unique `id` attribute
- ✅ Tooltip is not focusable (`tabindex="-1"` or none)
- ✅ Proper role hierarchy (button → tooltip, not vice-versa)

**Why It Matters:**
- Screen readers announce tooltip content when button is focused
- Incorrect relationships cause confusion for assistive technology users
- Common regression: Missing or swapped `aria-describedby` references

**Example:**
```typescript
const tipId = await tip.getAttribute('id');
const describedBy = await btn.getAttribute('aria-describedby');
expect(describedBy?.split(/\s+/)).toContain(tipId);
```

### 3. 🤖 Axe-Core Automated Scanning

Automated WCAG 2.0 Level A/AA compliance testing using axe-core.

**What We Test:**
- ✅ Color contrast ratios meet WCAG standards
- ✅ All interactive elements have accessible names
- ✅ Proper role usage (no invalid ARIA)
- ✅ Keyboard accessibility
- ✅ Form labels and error messages
- ✅ Heading hierarchy

**Installation:**
```bash
pnpm -C apps/web add -D @axe-core/playwright
```

**Usage:**
```typescript
import AxeBuilder from '@axe-core/playwright';

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  .analyze();

expect(results.violations).toEqual([]);
```

**Why It Matters:**
- Catches 30-40% of accessibility issues automatically
- Consistent enforcement of WCAG standards
- Fast feedback loop (runs in seconds)
- Prevents regression of fixed issues

### 4. 📸 Visual Regression Testing

Screenshot-based testing to catch layout and rendering issues.

**What We Test:**
- ✅ Tooltip positioning remains consistent
- ✅ No CSS/layout breakage
- ✅ Portal z-index layering works correctly
- ✅ Responsive design breakpoints

**Configuration:**
```typescript
await expect(page).toHaveScreenshot('tooltip-baseline.png', {
  maxDiffPixelRatio: 0.02,  // 2% tolerance for font rendering
  animations: 'disabled',    // No animation frames
  mask: [page.locator('[data-dynamic], time, [data-now]')], // Hide dynamic content
});
```

**First Run (Generate Baseline):**
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@visual" --update-snapshots
```

**Subsequent Runs (Compare to Baseline):**
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@visual"
```

**Why It Matters:**
- Catches visual regressions invisible to functional tests
- Validates portal rendering (tooltips, modals, dropdowns)
- Early detection of CSS breakage
- Prevents z-index stacking issues

## Running Accessibility Tests

### Quick Commands

```bash
# All accessibility tests (reduced-motion + ARIA + axe)
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y"

# Visual regression only
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@visual"

# Combined a11y + visual scan
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y|@visual"

# All tooltip tests (standard + a11y + visual)
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts

# CI mode (line reporter)
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y" --reporter=line
```

### Debug Mode

```bash
# Interactive UI mode
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y" --ui

# With trace recording
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y" --trace=on

# Headed mode (see browser)
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y" --headed
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: E2E Accessibility Tests
  run: |
    pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y|@visual"
  env:
    DEV_E2E_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
    DEV_E2E_PASSWORD: ${{ secrets.DEV_E2E_PASSWORD }}
    BASE_URL: http://localhost:5173

- name: Upload Visual Regression Failures
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: visual-regression-failures
    path: apps/web/test-results/
```

## Best Practices

### ✅ DO

- **Tag tests appropriately**: Use `@a11y`, `@visual`, `@ui` for filtering
- **Mask dynamic content**: Use `mask: [locator]` in screenshots to prevent false positives
- **Test real user flows**: Combine multiple interactions (hover → focus → ESC)
- **Use semantic selectors**: `getByRole`, `getByLabel` over CSS selectors
- **Run locally before commit**: Generate visual baselines on your machine first
- **Commit baselines**: Check in `.png` files for CI comparison
- **Test with real users**: Automated tests catch ~40% of issues; manual testing finds the rest

### ❌ DON'T

- **Don't skip baselines**: Visual tests fail without committed baseline images
- **Don't test implementation details**: Test user-facing behavior, not internal state
- **Don't use `waitForTimeout`**: Prefer `waitForLoadState`, `toBeVisible()` with timeouts
- **Don't hardcode pixel values**: Use percentage-based tolerances for cross-platform rendering
- **Don't ignore axe violations**: Every violation is a real accessibility issue
- **Don't test only happy paths**: Test error states, edge cases, and fallbacks

## WCAG Coverage Map

| WCAG Criterion | Test Type | Coverage |
|----------------|-----------|----------|
| 1.4.3 Contrast (Minimum) | Axe-core | ✅ Automated |
| 2.1.1 Keyboard | ARIA + functional | ✅ E2E + manual |
| 2.1.2 No Keyboard Trap | ARIA (tabindex) | ✅ Automated |
| 2.3.3 Animation from Interactions | Reduced Motion | ✅ E2E |
| 2.4.4 Link Purpose | Axe-core | ✅ Automated |
| 3.2.4 Consistent Identification | Visual regression | ✅ Screenshot |
| 4.1.2 Name, Role, Value | Axe-core + ARIA | ✅ Automated |
| 4.1.3 Status Messages | ARIA live regions | ⚠️ Manual testing needed |

## Troubleshooting

### "Expected violations to equal []"

**Cause:** Axe-core found accessibility violations.

**Fix:**
1. Run test with `--headed` to see violations in browser console
2. Check `results.violations` for details:
   ```typescript
   console.log(JSON.stringify(results.violations, null, 2));
   ```
3. Fix underlying accessibility issues (contrast, missing labels, etc.)

### "Screenshot comparison failed"

**Cause:** Visual regression detected or baseline doesn't exist.

**Fix:**
1. First run: `--update-snapshots` to generate baseline
2. Review diff image in `test-results/` folder
3. If intentional change: Update baseline with `--update-snapshots`
4. If regression: Fix CSS/layout issue

### "reducedMotion not working"

**Cause:** Test doesn't use `test.use({ contextOptions: { reducedMotion: 'reduce' } })`.

**Fix:**
```typescript
test.describe('@a11y reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('my test', async ({ page }) => {
    // Reduced motion is now active
  });
});
```

## Related Documentation

- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [Axe-Core Playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Visual Regression Testing with Playwright](https://playwright.dev/docs/test-snapshots)

## Future Enhancements

- [ ] Add screen reader testing with NVDA/JAWS automation
- [ ] Test with high contrast mode enabled
- [ ] Add keyboard navigation map validation
- [ ] Test with browser zoom levels (125%, 150%, 200%)
- [ ] Add focus visible indicator tests
- [ ] Test with Windows High Contrast themes
- [ ] Add color blindness simulation tests
- [ ] Test with different font size preferences
