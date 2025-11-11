# Chat Safe Mode Implementation Summary

## What Was Built

A comprehensive debugging system for isolating React #185 cross-document portal errors through compile-time safe mode and runtime portal validation.

## Files Created

### 1. `apps/web/src/chat/entry.tsx`
**Purpose**: Safe mode entry point with conditional boot logic

**Features**:
- Checks `VITE_CHAT_SAFE_MODE=1` at compile time
- Safe mode: Renders minimal "Chat minimal boot OK" div (no Radix, no portals)
- Normal mode: Lazy loads `main.tsx` and calls `bootChat(root)`
- Hard-fails if container is in wrong document

### 2. `apps/web/src/chat/react-dom-guard.ts`
**Purpose**: Runtime portal validation that throws on cross-document portals

**Features**:
- Wraps `ReactDOM.createPortal` with guard function
- Validates container is a DOM node
- Detects cross-document portals (container.ownerDocument !== iframe document)
- Logs detailed diagnostics: containerDoc, iframeDoc, containerId, component type, stack trace
- Hard-fails with readable error for sourcemap debugging

### 3. `apps/web/src/chat/SAFE_MODE_GUIDE.md`
**Purpose**: Complete operator's manual for debugging workflow

**Sections**:
- Architecture diagram
- Phase 1: Prove iframe boots (safe mode)
- Phase 2: Enable portal guard
- Phase 3: Disable overlays
- Phase 4: Re-enable components incrementally
- Portal guard output reference
- Environment variables reference
- Troubleshooting guide

## Files Modified

### `apps/web/src/chat/main.tsx`
- Import `react-dom-guard.ts` FIRST (before any Radix components)
- Export `bootChat(root: Root)` instead of self-mounting
- Remove DOMContentLoaded listener (handled by entry.tsx)

### `apps/web/chat/index.html`
- Change `#chat-root` to `#lm-chat-root` (consistent naming)
- Load `entry.tsx` instead of `main.tsx`
- Entry calls `mountChatDock()` which handles safe mode check

### `apps/web/vite.config.ts`
- Inject `VITE_CHAT_SAFE_MODE` env var into build
- Inject `VITE_DISABLE_OVERLAYS` env var into build

## How It Works

### Safe Mode Flow (VITE_CHAT_SAFE_MODE=1)
```
chat/index.html
  ↓
prelude.ts (portal patches)
  ↓
entry.tsx
  ↓
mountChatDock()
  ↓
Check import.meta.env.VITE_CHAT_SAFE_MODE === '1'
  ↓
YES → render <div>Chat minimal boot OK</div>
  ↓
END (no Radix, no portals, no main.tsx)
```

### Normal Mode Flow (VITE_CHAT_SAFE_MODE=0)
```
chat/index.html
  ↓
prelude.ts (portal patches)
  ↓
entry.tsx
  ↓
mountChatDock()
  ↓
Check import.meta.env.VITE_CHAT_SAFE_MODE === '1'
  ↓
NO → import('./main.tsx')
  ↓
main.tsx imports react-dom-guard.ts FIRST
  ↓
ReactDOM.createPortal wrapped with validator
  ↓
bootChat(root) renders full ChatDock
  ↓
Any portal to wrong document throws detailed error
```

## Portal Guard Error Example

When a component tries to portal to parent window:

```javascript
[chat-portal-guard] CROSS-DOC PORTAL {
  containerDoc: "https://app.ledger-mind.org/",           // Parent window
  iframeDoc: "https://app.ledger-mind.org/chat/index.html", // Iframe
  containerId: "radix-dropdown-menu-content",              // Portal target
  containerClass: "dropdown-content",
  nodePreview: "DropdownMenuContent",                     // Component name
  stack: "Error\n    at guarded (react-dom-guard.ts:28)\n    at DropdownMenu.render (...)"
}
```

**Stack trace shows EXACTLY** which component and call site is causing the cross-document portal.

## Testing Steps

### Phase 1: Prove Iframe Boots (Safe Mode)
```bash
# Build with safe mode
cd apps/web
VITE_CHAT_SAFE_MODE=1 BUILD_CHAT=1 pnpm build

# Deploy
docker cp dist/. ai-finance-nginx-1:/usr/share/nginx/html/
docker exec ai-finance-nginx-1 nginx -s reload

# Test
# Navigate to https://app.ledger-mind.org/?chat=1
# Expected: Green "Chat minimal boot OK" text in iframe
```

**If this fails**: Problem is CSP, HTML, or iframe sandbox attributes (not React)

### Phase 2: Enable Portal Guard (Normal Mode)
```bash
# Disable safe mode, full boot with portal guard
VITE_CHAT_SAFE_MODE=0 BUILD_CHAT=1 pnpm build
# Deploy and test
```

**Expected**: Either clean render OR detailed `[chat-portal-guard]` error pointing to offending component

### Phase 3: Disable Overlays
```bash
# Keep safe mode off, disable overlay providers
VITE_CHAT_SAFE_MODE=0 VITE_DISABLE_OVERLAYS=1 BUILD_CHAT=1 pnpm build
```

**Expected**: Chat renders without TooltipProvider/Toaster

### Phase 4: Re-enable Components
Add feature flags to incrementally enable:
- Dropdown menus
- Dialogs
- Tooltips
- Toaster

Each step should produce clean render OR portal guard error with exact component.

## Environment Variables

| Variable | Values | Effect |
|----------|--------|--------|
| `VITE_CHAT_SAFE_MODE` | `1`/`0` | `1` = Minimal boot, no Radix/portals |
| `VITE_DISABLE_OVERLAYS` | `1`/`0` | `1` = No TooltipProvider/Toaster |
| `BUILD_CHAT` | `1`/`0` | `1` = Build chat bundle |

## Current Status

✅ **Safe mode deployed** (build at 20:40:12)
- Chat bundle: 0.81 kB (minimal)
- Main app bundle: 237.56 kB
- Vendor-react: 764.16 kB

**Next Action**: Test at `https://app.ledger-mind.org/?chat=1`
- Should show green "Chat minimal boot OK" text in iframe
- If successful, proves iframe boots correctly
- Then disable safe mode to test with portal guard

## Debugging Tips

### Safe Mode Doesn't Render
1. Check network tab: chat-*.js loaded?
2. Check console: Any errors before React?
3. Check CSP headers: `curl -I https://app.ledger-mind.org/`

### Portal Guard Doesn't Throw
1. Confirm `[react-dom-guard] active` in console
2. Check `react-dom-guard.ts` imported first in `main.tsx`
3. Search bundle: `grep "chat-portal-guard" dist/assets/chat-*.js`

### Minified Stack Trace
1. Enable sourcemaps: `build: { sourcemap: true }`
2. DevTools → Sources → Click error line
3. Or disable minification: `build: { minify: false }`

## Architecture Benefits

1. **Compile-Time Safety**: Safe mode eliminates all portal code at build time
2. **Runtime Validation**: Portal guard catches cross-document portals immediately
3. **Detailed Diagnostics**: Stack traces and container info pinpoint exact offender
4. **Incremental Debugging**: Re-enable components one by one to isolate issue
5. **Zero Performance Impact**: Guard only active in development/debugging builds

## Files Checklist

- ✅ `apps/web/src/chat/entry.tsx` - Safe mode entry
- ✅ `apps/web/src/chat/react-dom-guard.ts` - Portal validator
- ✅ `apps/web/src/chat/SAFE_MODE_GUIDE.md` - Operator's manual
- ✅ `apps/web/src/chat/main.tsx` - Import guard, export bootChat
- ✅ `apps/web/chat/index.html` - Use entry.tsx
- ✅ `apps/web/vite.config.ts` - Inject env vars
