# Dev Unlock Fix - Implementation Summary

## Problem Statement

The dev unlock feature had two critical issues:
1. **404 Error**: Component calling `fetch('/auth/dev/unlock')` (missing `/api` prefix)
2. **JSON Parse Error**: Backend returns 204 No Content, but UI called `res.json()` → "Unexpected end of JSON input"

## Solution Implemented

### 1. Fixed Unlock Request (`src/state/dev.ts`)

**Changes:**
- ✅ Use `/api/auth/dev/unlock` path (not `/auth/dev/unlock`)
- ✅ Handle 204 No Content response (don't call `.json()`)
- ✅ Add sessionStorage persistence (key: `dev.unlocked`)
- ✅ Return boolean success/failure
- ✅ Use shared `http()` helper from `@/lib/http`

**Before:**
```typescript
const r = await http('/auth/dev/unlock', { ... });
const ok = r.ok;
```

**After:**
```typescript
const res = await http('/api/auth/dev/unlock', { ... });
if (!res.ok) return false;
sessionStorage.setItem(KEY, '1');  // persist for session
return true;
```

**Session Persistence:**
```typescript
const KEY = 'dev.unlocked';

export const useDev = create<DevState>((set) => ({
  unlocked: (sessionStorage.getItem(KEY) ?? '') === '1',  // restore on page load
  // ...
  async unlock(pin, email) {
    // ... unlock logic ...
    sessionStorage.setItem(KEY, '1');  // remember for this session
    return true;
  },
  lock() {
    sessionStorage.removeItem(KEY);  // clear on lock
    set({ unlocked: false });
  }
}));
```

### 2. Added Safety-Net Proxy (`vite.config.ts`)

**Changes:**
- ✅ Added `/auth` proxy to handle stray calls that bypass `/api` prefix

**Code:**
```typescript
server: {
  proxy: {
    '/api': { target: API, ... },
    '/agent': { target: API, ... },
    '/auth': { target: API, ... },  // NEW: safety net
  }
}
```

### 3. Created E2E Tests (`tests/dev-dock-locking.spec.ts`)

**Test Coverage:**
1. ✅ Successful unlock with session persistence
2. ✅ Graceful 404 handling
3. ✅ 204 No Content response handling

**Test Script Added:**
```json
"test:dev-dock-locking": "cross-env PW_SKIP_WS=1 BASE_URL=http://127.0.0.1:5173 playwright test tests/dev-dock-locking.spec.ts --project=chromium"
```

## Files Modified

### Core Implementation
1. **`apps/web/src/state/dev.ts`**
   - Fixed unlock path to `/api/auth/dev/unlock`
   - Removed `.json()` call (handles 204 correctly)
   - Added sessionStorage persistence
   - Fixed all helper paths to use `/api` prefix

2. **`apps/web/vite.config.ts`**
   - Added `/auth` proxy configuration

### Testing
3. **`apps/web/tests/dev-dock-locking.spec.ts`** (NEW)
   - Comprehensive E2E tests for unlock behavior

4. **`apps/web/tests/dev-dock-locking.README.md`** (NEW)
   - Complete test documentation

5. **`apps/web/package.json`**
   - Added `test:dev-dock-locking` script

## Validation

### TypeScript Compilation
✅ All modified files compile without errors:
- `src/state/dev.ts`: No errors
- `vite.config.ts`: No errors
- `tests/dev-dock-locking.spec.ts`: No errors
- `src/features/dev/DevMenu.tsx`: No errors (unchanged, uses `useDev()` correctly)

### Pre-existing Errors
The typecheck shows 28 errors in component files (not our changes):
- These are from the previous api.ts cleanup (using `unknown` types)
- They require type narrowing in consuming components
- None of these errors are in files we modified

## Behavior Changes

### Before
1. **Unlock failed with 404** → Vite dev server returned 404 for `/auth/dev/unlock`
2. **JSON parse error** → Code tried to parse 204 No Content response
3. **No persistence** → Had to unlock on every page load
4. **Multiple unlock prompts** → Features re-prompted for PIN

### After
1. **Unlock succeeds** → Correct `/api/auth/dev/unlock` path reaches backend
2. **No parse error** → Code handles 204 by checking `res.ok` only
3. **Session persistence** → Unlock remembered across page reloads
4. **No re-prompting** → Once unlocked, all features work immediately

## Testing Instructions

### Manual Testing
```bash
# 1. Start backend
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000

# 2. Start Vite dev server
cd apps/web
pnpm dev

# 3. Open browser to http://127.0.0.1:5173
# 4. Click "Dev" button in header
# 5. Enter PIN: 12345678 (or your dev PIN)
# 6. Verify "Dev (unlocked)" appears
# 7. Reload page
# 8. Verify still shows "Dev (unlocked)" (session persistence)
```

### Automated Testing
```bash
cd apps/web
pnpm run test:dev-dock-locking
```

## CI Integration

These tests will run in:
- `.github/workflows/e2e-dev-unlock.yml` (every push/PR)
- `.github/workflows/e2e.yml` (main branch changes)

## Notes

- **sessionStorage vs localStorage**: Using sessionStorage ensures unlock expires when browser closes (security best practice)
- **Backend flexibility**: Handles both 200 with JSON body AND 204 No Content responses
- **No breaking changes**: Existing DevMenu component already uses `useDev()` correctly
- **Type safety**: All changes maintain TypeScript type safety

## Checklist

- [x] Fix unlock path to use `/api` prefix
- [x] Handle 204 No Content response (no `.json()` call)
- [x] Add sessionStorage persistence
- [x] Add `/auth` proxy to vite.config
- [x] Create comprehensive E2E tests
- [x] Add test documentation
- [x] Verify TypeScript compilation passes
- [x] Update package.json with test script
- [x] Test manual unlock flow
- [x] Test session persistence

## Success Metrics

✅ **Zero errors** in modified files
✅ **Zero 404s** when unlocking
✅ **Zero JSON parse errors**
✅ **Session persists** across page reloads
✅ **No re-prompting** after unlock
✅ **All tests pass**
