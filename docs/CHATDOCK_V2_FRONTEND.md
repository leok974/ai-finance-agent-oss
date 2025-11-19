# ChatDock v2 Frontend Architecture

## Overview

ChatDock v2 is the finance assistant chat interface for LedgerMind. It renders as a **floating card** that appears at the bottom-center of the viewport when opened, with a fixed bubble launcher in the bottom-right corner. The architecture uses React portals to render directly into `document.body`, ensuring the chat overlay sits above all page content without being constrained by parent containers.

**Key Design Principles:**
- **Overlay-card pattern**: Bubble fixed bottom-right → Floating card at bottom-center with glassmorphic backdrop
- **Page remains scrollable**: Overlay uses `pointer-events: none` except on the shell
- **React Portal rendering**: Chat mounts to `document.body` via `createPortal()` to escape DOM hierarchy constraints
- **Single source of truth**: Chat state managed in Zustand store (`useChatSession`) with localStorage persistence
- **Escape key closes panel**: Global keyboard handler for quick dismiss

---

## CSS Structure

ChatDock v2 styling is split across two files with **intentional redundancy** to prevent build issues:

- **Base Tailwind + app styles**: `apps/web/src/index.css`
- **ChatDock v2 styles**: `apps/web/src/chat/index.css`

### Guardrails

**Critical:** The chat CSS file is imported in TWO places:

1. `index.css` must always include: `@import "./chat/index.css";`
2. `ChatDock.tsx` must always include: `import '../chat/index.css'`

**Why?** Vite's code-splitting can create **orphaned CSS chunks** if the chat CSS is only imported from the component. The global import in `index.css` ensures chat styles are bundled into the main CSS chunk that `index.html` loads. Without it, the assistant renders completely unstyled in production.

**Verification:** After modifying chat CSS, run `pnpm build && pnpm verify:chat-css` to ensure `.lm-chat-*` rules are present in the compiled bundle.

---

## Component Tree & Responsibilities

```
ChatDock.tsx (primary container)
├── Launcher (data-testid="lm-chat-launcher")
│   └── Button (data-testid="lm-chat-launcher-button")
│       - Fixed bottom-right positioning
│       - Click to toggle open/close
│       - Draggable (right/bottom anchored)
│
└── Portal to document.body (when open)
    └── Overlay (data-testid="lm-chat-overlay")
        - Fixed inset:0 fullscreen overlay
        - pointer-events:none (except shell)
        - Flex layout: align-items:flex-end, justify-content:center
        │
        └── Shell (data-testid="lm-chat-shell")
            - pointer-events:auto (captures clicks)
            - Width: min(480px, 100vw - 32px)
            - Max-height: min(420px, 100vh - 260px)
            - Border-radius: 24px, margin-bottom: 24px
            │
            ├── Backdrop (data-testid="lm-chat-backdrop")
            │   - Absolute positioned inset:-40px
            │   - Radial gradient with blur(22px)
            │
            └── Shell-inner (.lm-chat-shell-inner)
                └── Panel (data-testid="lm-chat-panel")
                    ├── CardHeader (lm-chat-header)
                    │   - Title, LLM status badge, export buttons
                    │
                    ├── Scroll container (data-testid="lm-chat-scroll")
                    │   - flex:1, overflow-y:auto
                    │   - Messages, day dividers, meta lines, chips
                    │
                    └── Composer (.lm-chat-composer)
                        - Textarea with Ctrl+Enter / Enter-to-send
                        - QuickChips (preset prompts)
```

**Component Responsibilities:**
- `ChatDock.tsx`: Root component, manages open/close state, ESC handler, click-away detection, portal rendering
- `MessageRenderer.tsx`: Renders assistant messages with Markdown, code blocks, finance data
- `QuickChips.tsx`: Preset prompt buttons (Month summary, Find subscriptions, etc.)
- `ChatControls.tsx`: Clear/Reset modals, Export actions
- `SaveRuleModal.tsx`: Modal for saving what-if scenarios as rules

---

## State & Stores

### Zustand Store: `useChatSession` (apps/web/src/state/chatSession.ts)

**Primary source of truth** for chat messages and session state.

```typescript
type Msg = { id: string; role: "user" | "assistant"; text: string; at: number; meta?: Record<string, any> };

type ChatState = {
  sessionId: string;         // crypto.randomUUID()
  messages: Msg[];           // Persisted message history
  isBusy: boolean;
  version: number;           // Force re-render key
  clearedAt?: number;        // Timestamp of last clear
  clearChat: () => void;
  resetSession: () => Promise<void>;
};
```

**Persistence:**
- Uses Zustand `persist` middleware with `localStorage` key `lm:chat`
- Cross-tab sync via `BroadcastChannel("lm-chat")` with echo-loop prevention (instance ID tagging)

**Local UI State (in ChatDock.tsx):**
- `open`: boolean - panel visibility
- `isClosing`: boolean - exit animation guard (220ms delay)
- `uiMessages`: Msg[] - synced from store messages for rendering
- `busy`: boolean - loading/streaming state

**State Flow:**
1. User sends message → `appendUser()` writes to store
2. Backend response → `appendAssistant()` writes to store + meta (citations, mode, suggestions)
3. Store update → Zustand triggers subscribers
4. `useEffect` syncs store messages → `uiMessages` → re-render

---

## CSS & Layout Layers

### Forced Layout Overrides (apps/web/src/chat/index.css lines 1179-1254)

**All rules use `!important` flags and `[data-testid]` attribute selectors** for maximum specificity to win over legacy class-based styles.

```css
/* Launcher: fixed bottom-right bubble */
[data-testid="lm-chat-launcher"] {
  position: fixed !important;
  right: 1.75rem !important;
  bottom: 1.75rem !important;
  z-index: 70 !important;
  pointer-events: none !important; /* Only button is clickable */
}

/* Overlay: fullscreen flex container */
[data-testid="lm-chat-overlay"] {
  position: fixed !important;
  inset: 0 !important;
  display: flex !important;
  align-items: flex-end !important;
  justify-content: center !important;
  pointer-events: none !important; /* Allows page scroll */
  z-index: 69 !important;
}

/* Shell: floating card at bottom-center */
[data-testid="lm-chat-shell"] {
  pointer-events: auto !important; /* Captures clicks */
  width: min(480px, 100vw - 32px) !important;
  max-height: min(420px, 100vh - 260px) !important;
  margin-bottom: 24px !important;
  border-radius: 24px !important;
  overflow: hidden !important;
  box-shadow: 0 18px 45px rgba(15,23,42,0.96) !important;
  transform-origin: bottom center !important;
}

/* Backdrop: glassmorphic glow behind shell */
[data-testid="lm-chat-backdrop"] {
  position: absolute !important;
  inset: -40px !important;
  background: radial-gradient(...) !important;
  filter: blur(22px) !important;
  opacity: 0.9 !important;
}

/* Scroll container: only chat content scrolls */
[data-testid="lm-chat-scroll"] {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  padding-right: 4px !important;
  margin-right: -4px !important;
  scrollbar-width: thin !important;
}
```

**Layer Hierarchy (z-index):**
- `70`: Launcher bubble (above overlay to remain clickable when open)
- `69`: Overlay (fullscreen backdrop layer)
- Shell/backdrop: Relative positioning within overlay (no explicit z-index needed)

---

## Data Attributes & Test IDs

All major elements use `data-testid` for E2E test stability:

| Element | data-testid | Purpose |
|---------|-------------|---------|
| Launcher container | `lm-chat-launcher` | Fixed bubble wrapper |
| Launcher button | `lm-chat-launcher-button` | Click target for open/close |
| Overlay | `lm-chat-overlay` | Fullscreen flex container |
| Shell | `lm-chat-shell` | Floating card container |
| Backdrop | `lm-chat-backdrop` | Glassmorphic glow layer |
| Panel | `lm-chat-panel` | Content wrapper (header + scroll + composer) |
| Scroll container | `lm-chat-scroll` | Message list scroll area |
| Composer textarea | `chat-composer` | User input field |

**Additional data attributes for state:**
- `data-state="open|closed"`: Attached to launcher for E2E visibility checks (avoids CSS opacity flakiness)

---

## Event Flow

### Open/Close Lifecycle

**Opening:**
1. User clicks launcher button → `handleOpen()` called
2. `setIsClosing(false)` → `setOpen(true)`
3. React renders portal with overlay+shell
4. CSS transitions: shell scales up from `transform: scale(0.92)` to `scale(1)` over 200ms

**Closing:**
1. User clicks X button, ESC key, or clicks outside shell → `handleClose()` called
2. `setIsClosing(true)` triggers exit animation (200ms)
3. `setTimeout(() => setOpen(false), 220)` waits for animation completion
4. Portal unmounts from DOM

### ESC Key Handler

```typescript
useEffect(() => {
  if (!open) return;
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") handleClose();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [open, handleClose]);
```

### Click-Away Detection

```typescript
useEffect(() => {
  if (!open) return;
  function handleClickAway(event: MouseEvent) {
    const shell = shellRef.current;
    const trigger = triggerRef.current;
    const target = event.target as Node;

    // If click is inside shell or bubble → ignore
    if (shell.contains(target) || (trigger && trigger.contains(target))) return;

    // Otherwise → close
    handleClose();
  }
  window.addEventListener("mousedown", handleClickAway);
  return () => window.removeEventListener("mousedown", handleClickAway);
}, [open, handleClose]);
```

### Resize Handling

Window resize events clamp the launcher/panel position to stay within viewport bounds:

```typescript
useEffect(() => {
  const onResize = () => {
    const rect = panelRef.current?.getBoundingClientRect();
    const w = rect?.width ?? (open ? PANEL_W_GUESS : BUBBLE);
    const h = rect?.height ?? (open ? PANEL_H_GUESS : BUBBLE);
    setRb((prev) => clampRB(prev, w, h));
  };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, [open]);
```

### Scroll Behavior

**Page scroll:** Works normally when chat is open because overlay uses `pointer-events: none` (only shell captures pointer events)

**Chat panel scroll:** Only the `.lm-chat-scroll` container scrolls (message list), not the entire shell. Header and composer remain fixed.

**Wheel event handling:**
```typescript
const handleScrollWheel = useCallback((event: React.WheelEvent) => {
  const el = event.currentTarget;
  const { scrollHeight, clientHeight, scrollTop } = el;

  // No overflow → let page scroll
  if (scrollHeight <= clientHeight) return;

  // Apply delta manually and prevent propagation if consumed
  el.scrollTop += event.deltaY;
  if (el.scrollTop !== scrollTop) {
    event.preventDefault();
    event.stopPropagation();
  }
}, []);
```

---

## Known Issues & Gotchas

### 1. **Prod vs Dev Layout Drift**

**Symptom:** Production may show bottom strip layout (wide panel at bottom edge) while dev shows floating card.

**Root Cause:** CSS bundling order differences or cached old bundles in production.

**Fix:** Added forced `!important` overrides at end of `chat/index.css` (lines 1179+) to win specificity battle. Redeploy nginx container with fresh bundle.

### 2. **Overlay Remains After Close (Ghost Clicks)**

**Symptom:** Invisible overlay blocks clicks after panel closes.

**Root Cause:** React portal not unmounting cleanly from `document.body`.

**Fix:** Ensure `open` state fully controls portal rendering:
```tsx
{open && portalReady && createPortal(/* overlay + shell */, document.body)}
```

### 3. **Double Scrollbars (Page + Panel)**

**Symptom:** Two vertical scrollbars appear when chat is open.

**Root Cause:** Both `html` and `.lm-chat-scroll` have `overflow-y: auto`.

**Fix:** Only `.lm-chat-scroll` scrolls. Overlay uses `pointer-events: none` so page scroll still works even with overlay visible.

### 4. **ESC Key Doesn't Close in Prod**

**Symptom:** ESC key handler doesn't fire in deployed environment.

**Root Cause:** Event listener attached to wrong document (parent window vs iframe in v1).

**Fix:** ChatDock v2 renders to parent `document.body`, so `window.addEventListener` works correctly. No iframe isolation.

### 5. **Click-Away Closes Even When Clicking Inside**

**Symptom:** Panel closes when clicking dropdowns or buttons inside shell.

**Root Cause:** Event delegation or refs not properly checking `contains()`.

**Fix:** Use refs for shell and trigger, check `target` ancestry:
```tsx
if (shell.contains(target) || (trigger && trigger.contains(target))) return;
```

### 6. **Portal Renders Before Body Ready**

**Symptom:** `createPortal(jsx, document.body)` throws error during SSR or fast hydration.

**Root Cause:** `document.body` may be null during initial React render in some environments.

**Fix:** Use `useSafePortalReady()` hook to wait for body availability:
```tsx
const portalReady = useSafePortalReady();
{open && portalReady && createPortal(/* ... */, document.body)}
```

### 7. **Zustand Persist Hydration Loop**

**Symptom:** Infinite re-renders or stale state flashing on mount.

**Root Cause:** Reading persisted state synchronously during render triggers React hydration warnings.

**Fix:** Initialize state from `getState()` in `useState` initializer, then subscribe in `useEffect`:
```tsx
const [chatState, setChatState] = useState(() => useChatSession.getState());
useEffect(() => {
  const unsub = useChatSession.subscribe(setChatState);
  return unsub;
}, []);
```

### 8. **Build Banner Not Showing in Dev**

**Symptom:** Console doesn't show `🧪 LedgerMind Web dev unknown@unknown (timestamp)`.

**Root Cause:** Vite env vars (`VITE_GIT_BRANCH`, etc.) not injected during dev server.

**Fix:** Use runtime fallbacks in `main.tsx`:
```tsx
const BRANCH = (import.meta.env.VITE_GIT_BRANCH as string | undefined) ?? "unknown";
const COMMIT = (import.meta.env.VITE_GIT_COMMIT as string | undefined) ?? "unknown";
```

---

## Development Guidelines

**When adding new chat features:**
1. ✅ Use `data-testid` for all interactive elements
2. ✅ Write to `useChatSession` store for persistence
3. ✅ Add `!important` CSS if fighting legacy specificity
4. ✅ Test click-away, ESC key, and resize behavior
5. ✅ Verify cross-tab sync (open two tabs, clear in one, check other)
6. ✅ Check scroll isolation (page scrolls even when chat open)

**When debugging layout issues:**
1. Check DevTools Computed Styles for `!important` overrides winning
2. Verify `data-testid="lm-chat-shell"` has `pointer-events: auto`
3. Confirm overlay has `pointer-events: none`
4. Check z-index stack: launcher(70) > overlay(69)
5. Inspect transform origin for animations: `bottom center`

**When refactoring state:**
1. Keep `useChatSession` as single source of truth
2. Use `uiMessages` local state only for rendering (synced from store)
3. Never mutate store messages directly - use `useChatSession.setState()`
4. Broadcast cross-tab events via `BroadcastChannel` with instance ID to prevent echo loops

---

## References

- **Component**: `apps/web/src/components/ChatDock.tsx`
- **State store**: `apps/web/src/state/chatSession.ts`
- **CSS overrides**: `apps/web/src/chat/index.css` (lines 1179-1254)
- **Test IDs**: Search codebase for `data-testid="lm-chat-*"`
- **E2E tests**: `apps/web/tests/e2e/chat-*.spec.ts`
