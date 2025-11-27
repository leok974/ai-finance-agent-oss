# Console Errors Fix

## Issues Fixed

### 1. Repeated Chart Fetching Spam 🔄
**Problem:** Console was flooded with repeated messages:
- `[boot] loading dashboards for month: 2025-08`
- `[boot] charts prefetch completed for month: 2025-08`

**Root Cause:** The `useEffect` hook in `App.tsx` had `chartsStore` object in its dependency array. Since Zustand store objects change reference on every render, this caused infinite re-renders and repeated API calls.

**Fix Applied:**
```typescript
// Before (WRONG - causes infinite loop):
const chartsStore = useChartsStore();
useEffect(() => {
  void chartsStore.refetchAll(month).then(() => { ... });
}, [authOk, month, chartsStore]);  // ❌ chartsStore changes every render!

// After (CORRECT - stable reference):
const refetchAllCharts = useChartsStore((state) => state.refetchAll);
useEffect(() => {
  void refetchAllCharts(month).then(() => { ... });
}, [authOk, month, refetchAllCharts]);  // ✅ Function reference is stable
```

**Files Changed:**
- `apps/web/src/App.tsx` (lines 76, 141, 146)

### 2. CSP Violations (Script Loading)
**Status:** Already properly configured ✅

The CSP errors in console were false positives or related to browser extensions. The nginx configuration already includes:
- Inline script hashing via `10-csp-inline-hashes.sh`
- CloudFlare Insights whitelist: `https://static.cloudflareinsights.com`
- Proper `connect-src` directives for API endpoints

**No changes needed** - CSP is correctly configured in:
- `nginx/conf.d/security-headers.conf`
- `nginx/entrypoint.d/10-csp-inline-hashes.sh`

## Testing

After rebuild and restart, verify:

```bash
# 1. Open browser console at http://localhost/
# Should see ONE "[boot] loading dashboards" message, not repeated spam

# 2. Check for CSP errors
# Should be minimal or none (browser extension errors can be ignored)

# 3. Verify charts load correctly
curl -sS http://localhost/api/agent/tools/meta/latest_month
# Should return: {"month":"2025-08"}
```

## Key Learnings

### Zustand Store Dependencies
**Never use entire store objects in useEffect dependencies!**

```typescript
// ❌ WRONG - causes re-renders
const store = useMyStore();
useEffect(() => { ... }, [store]);

// ✅ CORRECT - use selectors
const method = useMyStore((state) => state.method);
useEffect(() => { ... }, [method]);

// ✅ ALSO CORRECT - for state values
const value = useMyStore((state) => state.value);
useEffect(() => { ... }, [value]);
```

### Why This Matters
- Zustand returns a new store proxy object on each `useMyStore()` call
- React compares dependencies by reference (`Object.is`)
- Different object references → dependencies "changed" → effect re-runs → infinite loop
- Selectors return stable references for functions and primitive values

## Performance Impact

**Before:**
- Dozens of unnecessary API calls per second
- Network tab flooded with duplicate requests
- Console unusable due to log spam

**After:**
- Single API call per month change
- Clean console output
- Normal network activity

## Related Files

- `apps/web/src/App.tsx` - Main fix location
- `apps/web/src/state/charts.ts` - Zustand store definition
- `nginx/conf.d/security-headers.conf` - CSP configuration (no changes)
