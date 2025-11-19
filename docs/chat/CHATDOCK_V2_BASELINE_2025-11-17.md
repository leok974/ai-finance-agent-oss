# LedgerMind Web – ChatDock v2
## Baseline Snapshot – fix/chatdock-working-baseline (2025-11-17)

## 1. Scope & Environment

- **Project**: LedgerMind Web – ChatDock v2
- **Branch**: `fix/chatdock-working-baseline`
- **Target environment**: Production
- **Base URL**: https://app.ledger-mind.org

**Notes:**
- Debugging and verification are done against live prod using Playwright `chromium-prod` with `BASE_URL=app.ledger-mind.org`.
- The Nginx prod container is rebuilt via `docker-compose.prod.yml` on each iteration to ensure fresh bundles.

---

## 2. Baseline Layout & Behavior

### 2.1 Launcher Bubble

- **Label**: `LM`
- **Position**: Fixed in the bottom-right corner of the viewport.
- **Size**: ~44px square.
- **Behavior**:
  - Click → opens chat panel.
  - Hidden while the chat panel is open.
  - Reappears automatically when the panel closes.

### 2.2 Chat Panel (Shell)

**Positioning:**
- The shell is **absolutely positioned** inside the launcher container, anchored to the bottom-right, above the LM bubble.
- **Vertical offset**: `bottom: calc(44px + 16px)` → 44px for the bubble height + 16px gap.
- **Alignment**: Bottom-right.

**Appearance:**
- "LedgerMind Assistant" card with blue gradient header, scrollable content area, and a footer input row.

**Open/Close behavior:**
- Opens when the LM bubble is clicked.
- Closes when:
  - User clicks the invisible full-viewport backdrop (click-away).
  - User clicks the header close button.
  - ESC-key handling remains as per ChatDock v2 behavior (global key handler).

### 2.3 Backdrop

- **Type**: Full-viewport invisible button sibling to the shell.
- **DOM role**: Click-away target; wired to `handleClose`.
- **Pointer events**:
  - `pointer-events: auto` when the chat is open.
  - `pointer-events: none` when the chat is closed.
- **Visuals**:
  - Subtle dim/gradient effect only.
  - Heavy blur rules and aggressive `!important` overrides tied to `[data-testid="lm-chat-backdrop"]` have been **removed** to avoid layout/UX regressions.

---

## 3. Copy & Encoding

- **Greeting footer text**: `Hey! 👋`
- **Encoding**:
  - Emoji is stored as normal UTF-8 text in source.
  - The previous mojibake sequence (`Hey! ≡ƒæï`) has been **fully removed** and replaced with the correctly encoded string.
- **Playwright coupling**:
  - The `chat-panel-layout.spec.ts` test expects the exact text `Hey! 👋` in the greeting row.

---

## 4. Scrolling & Overflow Behavior

### 4.1 Page Scroll

**CSS override:**
```css
html, body { overflow: hidden auto !important; }
```

**Intent:**
- Fix earlier issues where minifier splits caused `overflow: hidden` on `<html>`/`<body>` in prod.
- **Ensure**:
  - No horizontal scroll / layout shift.
  - Vertical scroll behaves normally whether the chat is open or closed.

### 4.2 Chat Panel Scroll

**Structure:**
- Shell is a flex column.
- Gradient content area uses `flex: 1` and `overflow-y: auto` (scrollable messages).
- Footer input row uses `flex-shrink: 0` (stays pinned).

**Status:**
- Previously, chat content was reported as not scrollable in some states.
- After changing the shell to `position: absolute` and anchoring to the bubble, scroll behavior needs re-validation.

**Open TODO:**
- [ ] Add a focused Playwright test that:
  - Sends enough messages to require vertical scrolling.
  - Verifies that the messages container has `overflow-y: auto` and properly scrolls.
  - Confirms that page scroll is not hijacked when chat content is scrollable.

---

## 5. DOM Structure & Event Wiring

### 5.1 Portal & Tree

- **Portal root**: ChatDock renders via a React portal attached to `document.body` (unchanged from ChatDock v2 design).
- **Key DOM structure**:
  ```
  div.lm-chat-launcher
    ├── button.lm-chat-bubble[data-testid="lm-chat-bubble"]
    ├── button.lm-chat-backdrop[data-testid="lm-chat-backdrop"] (full-screen, only present when open)
    └── section.lm-chat-shell[data-state="open" | "closed"] (assistant card, positioned above the bubble)
  ```

### 5.2 Event Wiring

- **Launcher bubble click**:
  - `onClick` → `handleToggle` → toggles open state.
- **Backdrop click**:
  - `onClick` → `handleClose` → `setOpen(false)`.
- **Shell click**:
  - Clicks inside the shell stop propagation to avoid accidental closes from internal interactions (buttons, inputs, dropdowns).

---

## 6. CSS Highlights (Current Baseline)

**Note:** selectors here describe the intent of the current baseline; exact classnames/paths map to `chat/index.css` rules.

### 6.1 Launcher

**Selector:** `.lm-chat-launcher`

**Key rules:**
```css
position: fixed;
bottom: 24px;
right: 24px;
width: auto;
height: auto;
```
- Serves as the anchor for both bubble and shell.

### 6.2 Shell

**Selector:** `.lm-chat-shell`

**Key rules:**
```css
position: absolute;
right: 0;
bottom: calc(44px + 16px);
max-width: 640px;
display: flex;
flex-direction: column;
max-height: min(640px, calc(100vh - 96px));
```
- The shell is a flex column parent for header, scrollable content, and composer.

### 6.3 Backdrop

**Selector:** `.lm-chat-backdrop`

**Key rules:**
```css
position: fixed;
inset: 0;
```
- Z-index: below the shell but above base content.
- Background: transparent or subtle gradient.
- `pointer-events` toggled based on open/closed state.
- **No more `!important` hacks** coupled to `data-testid`.

### 6.4 Overflow Fix

**Selector:** `html, body`

**Rule:**
```css
overflow: hidden auto !important;
```

**Goal:**
- Prevent unwanted horizontal scroll.
- Preserve vertical scrolling for the page in all chat states.

---

## 7. Test Status

### 7.1 Playwright (E2E)

- **Project**: `chromium-prod`
- **BASE_URL**: `https://app.ledger-mind.org`

#### `chat-launcher-anim.spec.ts`
- **Status**: Passing after backdrop CSS cleanup.
- **Key assertions**:
  - Bubble + shell DOM structure is correct.
  - Panel opens from the launcher corner.
  - Backdrop click closes the panel and restores the launcher-only state.

#### `chat-panel-layout.spec.ts`
- **Status**: Previously failing on emoji encoding; now expected to pass after `Hey! 👋` fix.
- **Notes**:
  - Test expects exact greeting `Hey! 👋` in the footer.
  - Emoji garbling was due to mis-encoded source string; fixed by using direct UTF-8 literal.

**Caveats:**
- Full Playwright suite has not been re-run end-to-end after the latest positioning + greeting fixes. Only chat-related specs were targeted.

### 7.2 Vitest

- **Status**: Not re-run in this session after chat fixes.
- **Known issues** (unchanged, out of scope for this baseline):
  - Failures around `useChatSession.subscribe` and `__REAL_REACT_DOM__` shims.
  - These are unrelated to the ChatDock CSS/DOM changes described here and should be addressed separately.

---

## 8. Regressions Explicitly Avoided

This baseline intentionally avoids several previously observed bad states:

1. **Page scroll locked**:
   - Entire page stuck with `overflow: hidden` on `<html>`/`<body>` → no vertical scroll at all.

2. **Shell intercepting clicks when "closed"**:
   - Shell or overlay overlapping the launcher and capturing clicks even when visually hidden.

3. **Backdrop dominating the screen**:
   - Heavy blur backdrop covering the right side of the page and interfering with interactions.

4. **Centered chat shell**:
   - Shell anchored to the center of the viewport instead of being attached to the launcher bubble.

5. **Launcher label mojibake**:
   - LM bubble showing invalid glyphs instead of proper label.

6. **Backdrop not closing panel**:
   - Conflicting `[data-testid="lm-chat-backdrop"]` rules with `!important` prevented click-to-close from firing correctly.

7. **Broken greeting text**:
   - Greeting rendered as `Hey! ≡ƒæï` instead of `Hey! 👋`.

---

## 9. Next Steps / Open Questions

### 9.1 Chat Panel Scrolling

- [ ] Re-verify that long conversations are scrollable inside the panel after the absolute positioning change.
- [ ] Add a dedicated Playwright spec (e.g. `chat-panel-scroll.spec.ts`) that:
  - Sends enough messages to force vertical overflow.
  - Asserts that the messages container:
    - Has `overflow-y: auto`.
    - Actually scrolls when using the mouse wheel / keyboard.
  - Confirms the page itself remains scrollable when the chat is open.

### 9.2 Test Suite Cleanup

- [ ] Run the full Playwright suite on `chromium-prod` to catch any hidden regressions outside the chat specs.
- [ ] Revisit Vitest failures (`useChatSession` store + react-dom shims) as a separate effort from CSS/layout changes and document any coupling to the chat panel.

### 9.3 Visual Polish

- [ ] Fine-tune backdrop dim/blur now that the functional behavior is stable.
- [ ] (Optional) Add open/close animation tests to guard against regressions in the transition timing and easing.
