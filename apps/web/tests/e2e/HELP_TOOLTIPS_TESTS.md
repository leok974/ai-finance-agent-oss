# Help/Explain Tooltips E2E Tests

**Total Test Count: 13 tests**

## Overview

Comprehensive E2E test suite for Help/Explain tooltip UX that validates accessibility, keyboard navigation, portal layering, and exclusivity behavior.

## Test Coverage

### 1. **Hover Interaction** (`hover shows tooltip with role=tooltip`)
- ✅ Tooltip appears on hover
- ✅ Has proper `role="tooltip"` attribute
- ✅ Not blocked by overlays (`pointer-events` not `none`)
- ✅ Hides on mouseleave

### 2. **Keyboard Accessibility** (`keyboard focus shows tooltip`)
- ✅ Tooltip appears on focus
- ✅ ESC key closes tooltip
- ✅ Blur (Tab away) closes tooltip
- ✅ Proper keyboard navigation support

### 3. **Exclusivity** (`only one tooltip visible at a time`)
- ✅ Opening second tooltip closes first
- ✅ No multiple tooltips visible simultaneously
- ✅ Gracefully skips if <2 help buttons present

### 4. **Content Validation** (`tooltip content is present`)
- ✅ Content contains expected phrases (real help text)
- ✅ OR shows deterministic fallback message
- ✅ Not empty
- ✅ Handles help endpoint unavailability

### 5. **ARIA Attributes** (`accessible via keyboard navigation`)
- ✅ Proper `role="tooltip"` attribute
- ✅ Keyboard navigation works
- ✅ Announces properly to screen readers

### 6. **Rapid Interaction** (`multiple rapid hovers`)
- ✅ No flicker or crash on rapid hovers
- ✅ Stable after rapid interactions
- ✅ Tooltip still functions normally

### 7. **Portal Layering** (`respects z-index`)
- ✅ Tooltip appears above other content
- ✅ High z-index (>100, typically 9999+)
- ✅ Portal handles stacking context correctly

### 8. **Reduced Motion (a11y)** (`@a11y prefers-reduced-motion`)
- ✅ Tooltips open/close quickly with reduced motion
- ✅ Hover interactions complete in <150ms
- ✅ Keyboard ESC/Tab close in <150ms
- ✅ Tooltip geometry stays within viewport
- ✅ No long animations respect user preference

## Environment Variables

```bash
DEV_E2E_EMAIL=leoklemet.pa@gmail.com      # Login email
DEV_E2E_PASSWORD=Superleo3                # Login password
BASE_URL=http://127.0.0.1:5173            # App base URL
```

## Running the Tests

### Run all help tooltip tests
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts
```

### Run with UI mode (debug)
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts --ui
```

### Run with trace on first retry
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts --trace=on-first-retry
```

### Run specific test
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "hover shows"
```

### Run reduced-motion tests only
```bash
pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y"
```

## Test Strategy

### Accessible Selectors
The tests use **semantic, accessible selectors** instead of brittle CSS:

```typescript
// ✅ Good: Accessible role-based selectors
page.getByRole('button', { name: /help|explain/i })
page.getByRole('tooltip')
page.getByLabel(/email/i)

// ❌ Avoid: Brittle CSS selectors
page.locator('.help-button-class')
page.locator('#tooltip-id')
```

### Portal-Safe Assertions
Tooltips rendered via React portals are properly detected:

```typescript
const tip = page.getByRole('tooltip');
await expect(tip).toBeVisible();
await expect(tip).not.toHaveCSS('pointer-events', 'none');
```

### Graceful Skipping
Tests skip gracefully when insufficient elements are present:

```typescript
const count = await helpButtons(page).count();
if (count < 2) {
  test.skip();
  return;
}
```

## Help Mode Toggle

If your UI has a global "Help Mode" toggle, the tests automatically detect and enable it:

```typescript
const globalToggle = page.getByRole('button', { name: /help mode|show help/i });
if (await globalToggle.isVisible().catch(() => false)) {
  await globalToggle.click();
}
```

## Expected Content Patterns

The content validation test accepts either:

1. **Real help text** containing keywords:
   - `overview`, `how this works`, `top categories`
   - `daily flows`, `spending`, `budget`, `transactions`
   - `rules`, `insights`

2. **Fallback messages** when help endpoint is unavailable:
   - `no help available`, `try again`
   - `missing help content`, `loading help`
   - `help content unavailable`

## Accessibility Requirements

For tests to pass, help buttons must:

1. **Have accessible names**:
   ```tsx
   // ✅ Good
   <button aria-label="Help">?</button>
   <button>Help</button>

   // ❌ Bad (no accessible name)
   <button><Icon /></button>
   ```

2. **Tooltips must have `role="tooltip"`**:
   ```tsx
   <div role="tooltip">Help content</div>
   ```

3. **Support keyboard focus**:
   - Button should be focusable (not `tabindex="-1"`)
   - Tooltip should appear on focus

## Troubleshooting

### Test fails: "help button not visible"
1. Check if help mode needs to be enabled first
2. Verify button has accessible name (`aria-label` or text content)
3. Try adding `data-testid="help-toggle"` as fallback

### Test fails: "tooltip not visible on hover"
1. Check tooltip has `role="tooltip"` attribute
2. Verify tooltip is rendered in DOM (may be in portal)
3. Check z-index and `pointer-events` CSS

### Test fails: "multiple tooltips visible"
1. Verify exclusivity logic (close previous tooltip on open)
2. Check if tooltips are properly unmounting
3. Look for transition/animation timing issues

### Test fails: "content validation"
1. Check if help endpoint is accessible
2. Verify fallback message matches expected patterns
3. Ensure tooltip content is not empty

## CI Integration

Add to your Playwright CI workflow:

```yaml
- name: E2E Tests - Help Tooltips
  run: |
    pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts
  env:
    DEV_E2E_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
    DEV_E2E_PASSWORD: ${{ secrets.DEV_E2E_PASSWORD }}
    BASE_URL: http://localhost:5173

- name: E2E Tests - Help Tooltips (a11y + reduced motion)
  run: |
    pnpm -C apps/web exec playwright test tests/e2e/help-tooltips.spec.ts -g "@a11y|tooltip"
  env:
    DEV_E2E_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
    DEV_E2E_PASSWORD: ${{ secrets.DEV_E2E_PASSWORD }}
    BASE_URL: http://localhost:5173
```

### 9. **ARIA Relationship Check** (`@a11y tooltip is correctly described by trigger`)
- ✅ Tooltip has a unique `id` attribute
- ✅ Button's `aria-describedby` references the tooltip `id`
- ✅ Tooltip has `tabindex="-1"` or no `tabindex` (not focusable)
- ✅ Ensures proper ARIA semantics (button → tooltip, not vice-versa)
- 🎯 **Why**: Prevents common ARIA relationship regressions
- 🎯 **Catches**: Missing/incorrect `aria-describedby`, focusable tooltips

### 10. **Axe-Core Automated A11y Scan** (`@a11y axe scan passes on help tooltip state`)
- ✅ Runs axe-core WCAG 2.0 Level A/AA compliance check
- ✅ Checks color contrast, roles, names, keyboard accessibility
- ✅ Validates tooltip state (open) against accessibility violations
- 🎯 **Why**: Automated catch for a11y regressions (color, contrast, roles)
- 🎯 **Catches**: WCAG violations invisible to manual tests

### 11. **Visual Regression Baseline** (`tooltip visual baseline`)
- ✅ Screenshot comparison with baseline image (`tooltip-baseline.png`)
- ✅ Masks dynamic regions with `data-dynamic` attribute (loading indicators, source labels)
- ✅ Also masks timestamps (`<time>`) and spinners (`[aria-busy="true"]`)
- ✅ Allows 2% pixel diff tolerance for font rendering variations
- ✅ Disables animations for consistent screenshots
- 🎯 **Why**: Catches layout/CSS regressions (portal position, styling) without flaky diffs
- 🎯 **Catches**: Broken tooltips, z-index issues, layout shifts
- 🎯 **Dynamic Elements**: Source provider labels, loading indicators

**Implementation Details:**
- Tooltip content components use `data-dynamic` on volatile sub-elements
- Test masks `[data-dynamic]`, `time`, and spinner elements
- Uses `role="dialog"` locator (`data-popover-role="card-help"`)

**Note**: First run generates baseline. Commit `tooltip-baseline.png` for CI diffs.

## Related Documentation

- [Playwright Testing Guide](https://playwright.dev/)
- [ARIA Roles Reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles)
- [Tooltip Accessibility](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [Axe-Core Playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
- [Visual Regression Testing](https://playwright.dev/docs/test-snapshots)

## Future Enhancements

- [ ] Test tooltip positioning (above/below/left/right)
- [ ] Test tooltip max-width constraints
- [ ] Test tooltip with long content (scrolling)
- [ ] Test tooltip with rich content (links, formatting)
- [x] ~~Add visual regression tests for tooltip appearance~~ ✅ Implemented
- [x] ~~Add axe-core automated accessibility scanning~~ ✅ Implemented
- [ ] Test mobile touch interactions
