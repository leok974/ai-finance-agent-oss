# Chat Safe Mode & Portal Debugging Guide

## Overview

Chat Safe Mode is a compile-time debugging system to isolate React #185 cross-document portal errors. It allows incremental re-enablement of portal-heavy components.

## Architecture

```
chat/index.html
  ↓
prelude.ts (portal patches)
  ↓
entry.tsx (safe mode check)
  ↓
  ├─ SAFE MODE=1 → Minimal "Hello" div (no Radix, no portals)
  └─ SAFE MODE=0 → main.tsx → bootChat(root)
       ↓
       react-dom-guard.ts (runtime portal validation)
       ↓
       Full ChatDock with providers
```

## Phase 1: Prove Iframe Boots

**Goal**: Render minimal React without any portals to confirm iframe CSP/HTML is correct.

```bash
# Build with safe mode
VITE_CHAT_SAFE_MODE=1 BUILD_CHAT=1 pnpm build
docker cp apps/web/dist/. ai-finance-nginx-1:/usr/share/nginx/html/
docker exec ai-finance-nginx-1 nginx -s reload
```

**Expected**: Green "Chat minimal boot OK" text in iframe at `?chat=1`

**If it fails**: Problem is before React (CSP, HTML structure, iframe sandbox attrs)

## Phase 2: Enable Portal Guard

**Goal**: Boot full chat with runtime portal validation to catch cross-document portals.

```bash
# Disable safe mode, enable portal guard
VITE_CHAT_SAFE_MODE=0 BUILD_CHAT=1 pnpm build
```

**Expected**: Either clean render OR detailed error:
```
[chat-portal-guard] CROSS-DOC PORTAL
{
  containerDoc: "https://app.ledger-mind.org/",
  iframeDoc: "https://app.ledger-mind.org/chat/index.html",
  containerId: "radix-dropdown-menu-content",
  nodePreview: "DropdownMenuContent",
  stack: "Error\n    at guarded (react-dom-guard.ts:28:45)\n    ..."
}
```

The stack trace shows EXACTLY which component is portaling to parent window.

## Phase 3: Disable Overlays

**Goal**: Isolate which Radix component is causing cross-document portals.

```bash
# Keep safe mode off, disable all overlays
VITE_CHAT_SAFE_MODE=0 VITE_DISABLE_OVERLAYS=1 BUILD_CHAT=1 pnpm build
```

This disables:
- `<TooltipProvider>` (no tooltips)
- `<Toaster>` (no toast notifications)
- All Radix overlay components in ChatDock

**Expected**: Chat renders without dropdowns/dialogs/tooltips

## Phase 4: Re-enable Components One by One

Edit `chat/main.tsx` and `components/ChatDock.tsx` to conditionally enable:

### Step 1: Enable DropdownMenu
```tsx
// In ChatDock.tsx
const ENABLE_DROPDOWN = import.meta.env.VITE_ENABLE_DROPDOWN === '1';

{ENABLE_DROPDOWN && (
  <DropdownMenu>...</DropdownMenu>
)}
```

```bash
VITE_ENABLE_DROPDOWN=1 BUILD_CHAT=1 pnpm build
```

### Step 2: Enable Dialog
```bash
VITE_ENABLE_DIALOG=1 BUILD_CHAT=1 pnpm build
```

### Step 3: Enable TooltipProvider
```bash
VITE_DISABLE_OVERLAYS=0 BUILD_CHAT=1 pnpm build
```

### Step 4: Enable Toaster
```tsx
// In chat/main.tsx, re-add <Toaster />
```

## Portal Guard Output Reference

### ✅ Success (No Cross-Document Portals)
```
[react-dom-guard] active - cross-document portals will throw
[chat] mounted successfully
```

### ❌ Cross-Document Portal Detected
```
[chat-portal-guard] CROSS-DOC PORTAL {
  containerDoc: "https://app.ledger-mind.org/",      // ← Parent window
  iframeDoc: "https://app.ledger-mind.org/chat/...", // ← Iframe
  containerId: "radix-...",                          // ← Portal target
  nodePreview: "DropdownMenuContent",                // ← Component name
  stack: "..."                                       // ← Full stack trace
}
```

**Fix**: The component in `nodePreview` needs to use iframe-aware portal:
```tsx
// Wrong (portals to parent)
<DropdownMenuContent />

// Right (portals to iframe)
<Portal container={getPortalRoot()}>
  <DropdownMenuContent />
</Portal>
```

### ❌ Non-Node Container
```
[chat-portal-guard] Non-node container {
  containerType: "undefined",
  nodeType: undefined
}
```

**Fix**: Portal container is `undefined` or not a DOM node. Check `getPortalRoot()` returns valid element.

## Environment Variables Reference

| Variable | Values | Effect |
|----------|--------|--------|
| `VITE_CHAT_SAFE_MODE` | `1`/`0` | `1` = Minimal render, no Radix/portals |
| `VITE_DISABLE_OVERLAYS` | `1`/`0` | `1` = No TooltipProvider/Toaster |
| `BUILD_CHAT` | `1`/`0` | `1` = Build chat bundle |
| `VITE_ENABLE_DROPDOWN` | `1`/`0` | Custom flag for dropdown menu |
| `VITE_ENABLE_DIALOG` | `1`/`0` | Custom flag for dialogs |

## Vite Config Integration

Environment variables are injected at compile time:

```typescript
// vite.config.ts
define: {
  "import.meta.env.VITE_CHAT_SAFE_MODE": JSON.stringify(env.VITE_CHAT_SAFE_MODE ?? "0"),
  "import.meta.env.VITE_DISABLE_OVERLAYS": JSON.stringify(env.VITE_DISABLE_OVERLAYS ?? "0"),
}
```

## Troubleshooting

### Safe Mode Doesn't Show "Hello"
1. Check nginx served new bundle: `curl -I https://app.ledger-mind.org/chat/index.html`
2. Check browser loaded new bundle (DevTools → Network → chat-*.js)
3. Check CSP allows iframe scripts: `curl -I https://app.ledger-mind.org/ | grep -i content-security`

### Portal Guard Doesn't Throw
1. Confirm `react-dom-guard.ts` is imported FIRST in `chat/main.tsx`
2. Check console for `[react-dom-guard] active` message
3. Verify build includes guard: `grep -r "chat-portal-guard" dist/assets/chat-*.js`

### Stack Trace Points to Minified Code
1. Enable sourcemaps: `build: { sourcemap: true }` in vite.config.ts
2. DevTools → Sources → Click error line to see original file
3. Or disable minification for chat: `build: { minify: false }` (production only for debugging)

## Next Steps After Isolating Offender

1. Wrap component in iframe-aware `<Portal>` wrapper
2. Pass explicit `container={getPortalRoot()}` to Radix component
3. Create chat-specific UI wrapper (e.g., `chat/ui/dropdown-menu.tsx`)
4. Test with portal guard still enabled to confirm fix

## Files Modified

- `apps/web/src/chat/entry.tsx` - Safe mode entry point
- `apps/web/src/chat/react-dom-guard.ts` - Runtime portal validation
- `apps/web/src/chat/main.tsx` - Import guard first, export bootChat
- `apps/web/chat/index.html` - Use entry.tsx instead of main.tsx
- `apps/web/vite.config.ts` - Inject safe mode env vars
