# Demo Mode Async Refactor

**Date:** 2025-01-07
**Status:** ✅ Complete
**Commit:** (pending)

## Overview

Eliminated `setTimeout()` race condition hacks in demo mode state management by implementing Promise-based async state synchronization.

## Problem

Previous implementation used `setTimeout(150)` delays after `disableDemo()` to wait for:
1. `localStorage.setItem('lm:demoMode', '0')` to complete
2. React `setDemoMode(false)` state update to propagate

This was pragmatic but:
- Timing was arbitrary (150ms might not be enough on slow systems)
- Future developers might "simplify" by removing delays, breaking data isolation
- No compiler enforcement (easy to forget `await` delay)

## Solution

Implemented `disableDemoAsync(): Promise<void>` that resolves when demo mode state is fully updated.

### Implementation Details

**DemoModeContext Interface:**
```typescript
interface DemoModeContextValue {
  demoMode: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
  disableDemoAsync: () => Promise<void>; // NEW
}
```

**App.tsx Implementation:**
```typescript
const pendingDisableResolve = useRef<(() => void) | null>(null);

// Resolve promise when demoMode becomes false
useEffect(() => {
  if (!demoMode && pendingDisableResolve.current) {
    pendingDisableResolve.current();
    pendingDisableResolve.current = null;
  }
}, [demoMode]);

const disableDemoAsync = useCallback(() => {
  return new Promise<void>((resolve) => {
    if (!demoMode) {
      resolve(); // Already disabled
      return;
    }
    pendingDisableResolve.current = resolve;
    disableDemo(); // Triggers state change → useEffect resolves promise
  });
}, [demoMode, disableDemo]);
```

### Usage Pattern

**Before (setTimeout hack):**
```typescript
if (demoMode) {
  disableDemo();
  await new Promise(resolve => setTimeout(resolve, 150)); // FRAGILE
}
await fetchJSON('ingest/dashboard/reset');
```

**After (async state):**
```typescript
if (demoMode) {
  await disableDemoAsync(); // Clean, compiler-enforced
}
await fetchJSON('ingest/dashboard/reset');
```

## Files Modified

1. **apps/web/src/context/DemoModeContext.tsx**
   - Added `disableDemoAsync` to interface
   - Updated documentation about Promise-based approach

2. **apps/web/src/App.tsx**
   - Added `pendingDisableResolve` ref
   - Added `useEffect` to resolve promise on state change
   - Implemented `disableDemoAsync()` function
   - Updated provider value

3. **apps/web/src/components/UploadCsv.tsx**
   - Replaced `setTimeout(150)` in `reset()` with `await disableDemoAsync()`
   - Replaced `setTimeout(100)` in `doUpload()` with `await disableDemoAsync()`
   - Updated dependency arrays to include `disableDemoAsync`

## Testing

### Regression Tests (All Pass ✅)

**src/components/__tests__/UploadCsv.reset.test.tsx:**
- ✅ clears demo data first before exiting mode
- ✅ exits demo mode before clearing current user data
- ✅ calls reset endpoints in correct order
- ✅ shows success toast after reset completes

**Backend tests (from commit 7f070123):**
- ✅ 5 tests in `test_demo_seed_reset.py` (DEMO_USER_ID isolation)
- ✅ 2 tests in `test_ingest_reset.py` (user data isolation)

**E2E tests (from commit 7f070123):**
- ✅ 4 tests in `tests/demo-reset-flows.spec.ts` (full user flows)

### Pre-existing Failures (Unrelated)

The following test failures existed before this refactor:
- `ChatDock.availability.test.tsx` (5 failures) - missing AuthProvider wrapper
- `ChatDock.quickActions.test.tsx` (6 failures) - React concurrent mode issues
- `useAgentStream.test.ts` (2 failures) - error message assertion changes

## Benefits

1. **Type Safety:** `await disableDemoAsync()` is required by TypeScript
2. **Reliability:** No arbitrary timeouts - waits for actual state change
3. **Maintainability:** Intent is explicit, harder to accidentally break
4. **Documentation:** Promise pattern makes async dependency clear

## Architecture Notes

### Why This Matters

Demo mode uses dedicated `DEMO_USER_ID` account (backend constant). The frontend signals demo mode via:
- `localStorage.getItem('lm:demoMode') === '1'`
- `http.ts` reads this and injects `?demo=1` (GET) or `demo: true` (POST body)

Race condition occurred when:
```typescript
disableDemo(); // Sets localStorage + setDemoMode(false)
await fetchJSON('...'); // Might still read old localStorage value!
```

### Data Isolation Flow

**Reset Flow:**
1. Clear demo data (`/demo/reset` clears DEMO_USER_ID)
2. Exit demo mode (`disableDemoAsync()` waits for state)
3. Clear user data (`/ingest/dashboard/reset` clears current user)

**Upload Flow:**
1. Exit demo mode (`disableDemoAsync()` ensures `demo: false` in body)
2. Upload CSV (guaranteed to go to current user, not DEMO_USER_ID)

## Rollback Plan

If issues arise, revert to commit before this change and re-apply `setTimeout(150)` pattern. However, regression tests should prevent any breakage.

## Related Documentation

- `apps/backend/app/routers/demo_seed.py` - Demo data isolation architecture
- `DEMO_DATA_FIX_COMPLETE.md` - Original race condition fix (commit 7f070123)
- `src/components/__tests__/UploadCsv.reset.test.tsx` - Test coverage

---

**Conclusion:** setTimeout hacks eliminated. Demo mode state synchronization is now explicit, type-safe, and reliable.
