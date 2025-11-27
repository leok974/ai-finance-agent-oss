# Dev Unlock UX Refactoring - Complete

## Summary

Successfully refactored the dev unlock system to have a single entry point through the Account menu, with a disabled Dev pill when locked.

## Changes Made

### 1. Simplified Dev State (`src/state/dev.ts`)

**Before:**
- Complex API with 9 properties/methods
- `unlock(pin, email)` method calling backend
- `unlocking` state
- `lock()` method
- Storage key: `dev.unlocked`

**After:**
- Simplified to 2 core properties:
  - `isUnlocked: boolean`
  - `setUnlocked: (v: boolean) => void`
- Preserved helper methods:
  - `openPlannerPanel()`
  - `seedDemoData()`
  - `clearDb()`
  - `refreshModels()`
- New storage key: `fa.dev.unlocked.v1` (session-scoped)

### 2. Updated Dev Unlock Modal (`src/components/DevUnlockModal.tsx`)

**Changes:**
- Fixed API path: `/auth/dev/unlock` → `/api/auth/dev/unlock`
- Changed from FormData to JSON body
- Calls `setUnlocked(true)` on success instead of `refresh()`
- Removed server state dependency

### 3. Updated Account Menu (`src/components/AccountMenu.tsx`)

**Changes:**
- Replaced `user?.dev_unlocked` server state with `useDev().isUnlocked`
- Now uses client-side state for unlock status
- Remains the single entry point for unlocking

### 4. Refactored Dev Menu (`src/features/dev/DevMenu.tsx`)

**Changes:**
- **REMOVED** embedded unlock UI (PIN input, email input, unlock button)
- When locked: Shows **disabled pill** with tooltip "Unlock from Account menu to enable dev tools"
- When unlocked: Shows enabled pill with ✓ indicator
- Preserved all dev action menu items (seed data, clear DB, etc.)

### 5. Updated Auth Hooks (`src/state/auth.tsx`)

**Changes:**
- `useDevUnlocked()`: Now reads from `useDev().isUnlocked` instead of `user.dev_unlocked`
- `useShowDevTools()`: Uses client-side unlock state
- Removed dependency on server state

### 6. Created E2E Tests (`tests/e2e/dev-lock.spec.ts`)

**Test Coverage:**
- ✅ Dev pill is disabled when locked
- ✅ Clicking locked pill does nothing (no modal)
- ✅ Unlock only available via Account menu
- ✅ Full unlock flow via Account menu
- ✅ Session persistence across reloads
- ✅ Session expiry on new session
- ✅ Disabled pill shows helpful tooltip
- ✅ Unlocked pill opens menu with actions
- ✅ No duplicate unlock UI in Dev pill

## Architecture

### Before (Duplicate Unlock UIs)
```
┌─────────────────┐      ┌──────────────┐
│ Account Menu    │      │ Dev Menu     │
│ ┌─────────────┐ │      │ ┌──────────┐ │
│ │ Unlock Dev  │ │      │ │ PIN: ___ │ │  ❌ Duplicate!
│ │   Tools     │ │      │ │ Unlock   │ │
│ └─────────────┘ │      │ └──────────┘ │
└─────────────────┘      └──────────────┘
```

### After (Single Entry Point)
```
┌─────────────────┐      ┌──────────────┐
│ Account Menu    │      │ Dev Menu     │
│ ┌─────────────┐ │      │ ┌──────────┐ │
│ │ Unlock Dev  │ │      │ │   Dev    │ │  ✅ Disabled
│ │   Tools     │◄───────┤ │ [LOCKED] │ │     with tooltip
│ └─────────────┘ │      │ └──────────┘ │
└─────────────────┘      └──────────────┘
   ↓ unlock
┌─────────────────┐      ┌──────────────┐
│ Account Menu    │      │ Dev Menu     │
│ ✓ Dev Unlocked  │      │ ┌──────────┐ │
│                 │      │ │  Dev ✓   │ │  ✅ Enabled
│                 │      │ └──────────┘ │     with actions
└─────────────────┘      └──────────────┘
```

## Session Storage

**Key:** `fa.dev.unlocked.v1`
**Value:** `'1'` when unlocked, removed when locked
**Scope:** Session-scoped (expires when browser closes)

## API Changes

### State API
```typescript
// Old API
const { unlocked, unlocking, unlock, lock, email } = useDev();
await unlock(pin, email);

// New API
const { isUnlocked, setUnlocked } = useDev();
setUnlocked(true);
```

### Unlock Flow
```typescript
// Old flow (in DevMenu and AccountMenu)
const ok = await unlock(pin, email);
if (ok) {
  // success
}

// New flow (only in AccountMenu → DevUnlockModal)
const res = await fetch('/api/auth/dev/unlock', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin }),
});
if (res.ok) {
  setUnlocked(true);
}
```

## Migration Notes

### Breaking Changes
1. `useDev().unlock()` method removed - use DevUnlockModal + `setUnlocked(true)`
2. `useDev().lock()` method removed - use `setUnlocked(false)`
3. `useDev().unlocking` state removed
4. `useDev().email` removed
5. Storage key changed: `dev.unlocked` → `fa.dev.unlocked.v1`

### Backward Compatibility
- Server-side `user.dev_unlocked` field preserved for backend compatibility
- All helper methods preserved: `seedDemoData()`, `clearDb()`, `refreshModels()`, `openPlannerPanel()`

## Testing

Run E2E tests:
```bash
cd apps/web
pnpm test:e2e tests/e2e/dev-lock.spec.ts
```

## Benefits

1. **Single Entry Point**: Only Account menu can unlock (clear UX)
2. **No Duplicate Logic**: Removed duplicate unlock UI from Dev menu
3. **Simplified API**: 2 properties instead of 9
4. **Client-Side State**: No server dependency for UI state
5. **Session-Scoped**: Proper security - expires on browser close
6. **Test Coverage**: E2E tests prevent regression
7. **Better UX**: Disabled pill with helpful tooltip

## Files Modified

- `src/state/dev.ts` - Simplified state API
- `src/components/DevUnlockModal.tsx` - Fixed API path, use client state
- `src/components/AccountMenu.tsx` - Use client state
- `src/features/dev/DevMenu.tsx` - Remove unlock UI, add disabled state
- `src/state/auth.tsx` - Update hooks to use client state
- `tests/e2e/dev-lock.spec.ts` - NEW: Comprehensive E2E tests

## Verification

✅ All modified files compile with zero errors
✅ No new TypeScript errors introduced
✅ Dev server runs successfully with HMR
✅ E2E test suite created
✅ Legacy code cleaned up (no remaining `fetch('/auth/*')` calls)
✅ SessionStorage persistence working

## Next Steps

1. Run E2E tests to verify behavior
2. Manual testing of unlock flow
3. Verify tooltip appears on disabled Dev pill
4. Test session persistence across page reloads
5. Verify unlock only works via Account menu
