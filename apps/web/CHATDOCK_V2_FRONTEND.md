# ChatDock v2 Frontend Architecture

## Overview

ChatDock v2 is a direct React component implementation that renders an AI assistant chat interface anchored to the bottom-right corner of the application. Unlike the previous iframe-based approach, the chat panel is positioned absolutely inside the launcher container, creating a more integrated user experience.

**Key Design Principles:**

- **Anchored Layout:** Card is anchored above the LM bubble in the bottom-right with a fixed 16px gap
- **Panel Positioning:** Absolutely positioned inside the launcher container, not a viewport-centered overlay
- **Backdrop Scroll Handling:** Full-viewport backdrop intercepts events but forwards scroll events to maintain page scrollability
- **No Portal:** Direct rendering in the component tree, no React portals

## Component Tree / Layout

```
ChatDock.tsx
├── Launcher (bottom-right, LM bubble, data-testid="lm-chat-launcher-button")
│   └── 44px circular button with LM logo
└── When open:
    ├── Backdrop button (full viewport, data-testid="lm-chat-backdrop")
    │   └── Dim background overlay, click-to-close functionality
    └── Shell card (anchored above bubble, data-testid="lm-chat-shell")
        └── Chat panel content (data-testid="lm-chat-panel")
```

**Visual Layout:**

- **Launcher:** Fixed position at bottom-right corner (default: `bottom: 1rem, right: 1rem`)
- **Shell:** Absolutely positioned inside launcher container
  - Anchored above the bubble with 16px gap (`bottom: calc(44px + 16px)`)
  - Aligned to bottom-right, not bottom-center of viewport
- **Backdrop:** Full viewport button sibling to shell
  - `position: fixed; inset: 0;`
  - Dim background for visual focus
  - Intercepts clicks for close-on-backdrop functionality

## CSS & Scroll Behavior

### Layout Styles

```css
/* Launcher container */
.chat-launcher {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 50;
}

/* Chat shell - anchored above bubble */
.chat-shell {
  position: absolute;
  bottom: calc(44px + 16px); /* 44px bubble + 16px gap */
  right: 0;
  width: 400px; /* or responsive */
  max-height: calc(100vh - 100px);
}

/* Backdrop - full viewport */
.chat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 40; /* Below shell, above rest of page */
}
```

### Backdrop Scroll Handling

**Problem:** When chat is open, the backdrop covers the entire viewport and intercepts all pointer events. This would normally prevent page scrolling when the user's cursor is over the dimmed area.

**Solution:** JavaScript-based scroll event forwarding on the backdrop element.

**Implementation:**

```typescript
// Wheel event handler (desktop)
const handleBackdropWheel = (event: WheelEvent) => {
  window.scrollBy({ top: event.deltaY, behavior: "auto" });
  // Note: Do NOT call preventDefault - let the event propagate naturally
};

// Touch move handler (mobile)
const handleBackdropTouchMove = (event: TouchEvent) => {
  const currentY = event.touches[0].clientY;
  const deltaY = previousTouchY - currentY;
  window.scrollBy({ top: deltaY, behavior: "auto" });
  previousTouchY = currentY;
  // Note: Do NOT call preventDefault - preserve native scroll behavior
};
```

**Key Points:**

- The backdrop stays on top (z-index: 40) and intercepts events for click-to-close
- Scroll events (wheel + touchmove) are forwarded to `window.scrollBy()`
- No `preventDefault()` is called, allowing natural scroll behavior
- Page scroll works even with chat open and cursor hovering over dimmed area

**Previous Approach (Deprecated):**

- Used `pointer-events: none` on overlay to allow scroll passthrough
- Required careful z-index management and had edge cases
- Current approach is more reliable and explicit

## Test IDs

All major elements have `data-testid` attributes for E2E testing:

| Element | Test ID | Description |
|---------|---------|-------------|
| Launcher Button | `lm-chat-launcher-button` | 44px circular LM bubble, opens/closes chat |
| Launcher Root | `lm-chat-launcher` | Container for launcher + shell + backdrop |
| Chat Shell | `lm-chat-shell` | Absolutely positioned card above bubble |
| Chat Panel | `lm-chat-panel` | Card inside shell with actual chat content |
| Chat Scroll Area | `lm-chat-scroll` | Scrollable content area for messages |
| Backdrop | `lm-chat-backdrop` | Full viewport button for dim + click-to-close |

**Deprecated Test IDs (v1 iframe-based):**

- ❌ `lm-chat-bubble` → Use `lm-chat-launcher-button`
- ❌ `lm-chat-iframe` → Use `lm-chat-shell`
- ❌ `lm-chat-overlay` → Conceptually replaced by `lm-chat-backdrop`

## Animation States

The launcher root container has a `data-state` attribute for animation tracking:

- `data-state="closed"` - Chat is closed
- `data-state="open"` - Chat is open

**Example CSS:**

```css
[data-state="open"] .chat-shell {
  animation: slideUp 200ms ease-out;
}

[data-state="closed"] .chat-shell {
  animation: slideDown 200ms ease-in;
}
```

## Tests

### E2E Test Coverage

All E2E tests are tagged with `@prod` and run against production using the `chromium-prod` project.

#### chat-panel-scroll-open.spec.ts

**Purpose:** Ensure page scroll still works when chat is open and backdrop is present.

**Tags:** `@prod`, `@chat`

**Flow:**

1. Navigate to `/`
2. Inject a tall filler element (`<div style="height: 2000px">`) to make the page scrollable
3. Open chat via `data-testid="lm-chat-launcher-button"`
4. Assert `lm-chat-shell` is visible
5. Call `window.scrollTo(0, 800)` to scroll down
6. Assert `window.scrollY >= 800` even with chat + backdrop open

**Why This Matters:**

This test guards against regressions where the backdrop blocks scrolling. It validates that the JavaScript-based scroll forwarding (handleBackdropWheel + handleBackdropTouchMove) is working correctly.

**Example:**

```typescript
test("@prod @chat page scrolls with chat open", async ({ page }) => {
  await page.goto("/");

  // Make page scrollable
  await page.evaluate(() => {
    const filler = document.createElement("div");
    filler.style.height = "2000px";
    document.body.appendChild(filler);
  });

  // Open chat
  await page.locator('[data-testid="lm-chat-launcher-button"]').click();
  await page.locator('[data-testid="lm-chat-shell"]').waitFor({ state: "visible" });

  // Test scroll
  await page.evaluate(() => window.scrollTo(0, 800));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThanOrEqual(800);
});
```

#### Other Chat Tests

See `CHATDOCK_V2_MIGRATION.md` for the full list of migrated tests:

- `chat-smoke.spec.ts` - Basic functionality (5 tests)
- `chat.anchor.visible.spec.ts` - Positioning tests
- `chat.clamp.anchor.spec.ts` - Boundary tests
- `chat-clip.spec.ts` - Visibility/opacity tests
- And 50+ more tests in migration

## Migration from v1 (Iframe-based)

If you're updating tests or components that reference the old iframe-based chat:

### 1. Update Test IDs

```typescript
// Before (v1)
const bubble = page.locator('[data-testid="lm-chat-bubble"]');
const iframe = page.locator('[data-testid="lm-chat-iframe"]');

// After (v2)
const bubble = page.locator('[data-testid="lm-chat-launcher-button"]');
const shell = page.locator('[data-testid="lm-chat-shell"]');
```

### 2. Remove frameLocator Calls

```typescript
// Before (v1)
const frame = page.frameLocator('#lm-chat-iframe');
const element = frame.locator('.some-class');

// After (v2)
const element = page.locator('.some-class'); // Direct access, no iframe
```

### 3. Update Size/Position Checks

```typescript
// Before (v1)
const box = await iframe.boundingBox();
expect(box!.height).toBeLessThan(viewport.height);

// After (v2)
// Shell may be larger than viewport (contains scrollable content)
const panel = page.locator('[data-testid="lm-chat-panel"]');
const box = await panel.boundingBox();
expect(box!.height).toBeLessThan(viewport.height);
```

### 4. Console Log Changes

```typescript
// v2 logs during initialization:
// [ChatDock] render start
// [ChatDock] v0906f loaded
// [ChatDockProvider] render
```

## Best Practices

1. **Always use test IDs** - Don't rely on class names or DOM structure
2. **Test with backdrop** - Verify scroll/interaction behavior when chat is open
3. **Check both states** - Test launcher in both `open` and `closed` states
4. **Responsive testing** - Test at multiple viewport sizes
5. **Animation awareness** - Use `waitFor({ state: 'visible' })` to account for animations

## Known Issues & Scroll Behavior

**Historical Context:**

- **v1 approach:** Used `pointer-events: none` on the overlay to allow scroll passthrough
  - Problem: Required careful z-index management and had edge cases with clickable elements
  - Solution worked but was fragile

- **Current (v2) approach:** Uses a full-screen backdrop with explicit wheel/touchmove forwarding
  - The backdrop intercepts all events (needed for click-to-close and visual dimming)
  - JavaScript handlers forward scroll events to `window.scrollBy()`
  - More explicit and reliable than pointer-events tricks

**The E2E test `chat-panel-scroll-open.spec.ts` guards against regressions where the backdrop blocks scrolling.**

## Future Improvements

- [ ] Add keyboard navigation (Escape to close, Tab focus management)
- [ ] Improve mobile responsiveness (full-height on small screens?)
- [ ] Add resize handle for adjustable chat width
- [ ] Persist chat state (open/closed) across page navigations
- [ ] Add animation spring physics for smoother transitions
