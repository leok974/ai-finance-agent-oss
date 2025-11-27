# Hotfix: Authentication Guard Race Condition (2025-11-07)

## Critical Issue
Production deployment broke with HTTP 500 errors on `/agent/tools/*` endpoints and blank screens after login.

## Root Causes Identified

### 1. **Race Condition in Data Fetching** ⚠️ CRITICAL
Frontend `useEffect` hooks were checking `authOk` (user exists) but NOT `authReady` (auth state loaded).

**Timeline**:
```
t=0ms: Page loads, authReady=false, authOk=false
t=50ms: Auth check completes, authReady=true, authOk=false (not logged in)
t=100ms: User clicks login, redirects to OAuth
t=200ms: OAuth redirects back, authReady=false (reinitializing)
t=250ms: useEffect fires with authOk=true but authReady=false ❌
         → API calls fire BEFORE auth state is stable
t=300ms: authReady=true, but API calls already sent
```

### 2. **Vite Chunk Hash Stability**
Vite was reusing chunk hashes across builds when only comments changed, causing aggressive browser caching.

### 3. **BroadcastChannel Red Herring**
Initial diagnosis focused on BroadcastChannel causing React error #185, but disabling it didn't fix the issue.

## Fixes Applied

### Frontend: Triple Auth Guards (Commit 9676afa3)

**Before** (Race condition):
```typescript
useEffect(() => {
  if (!authOk || !month) return; // ❌ authReady not checked
  void agentTools.insightsExpanded({ month });
}, [authOk, month]);
```

**After** (Safe):
```typescript
useEffect(() => {
  if (!authReady || !authOk || !ready || !month) return; // ✅ All guards
  void agentTools.insightsExpanded({ month });
}, [authReady, authOk, ready, month]);
```

**Applied to**:
- Charts prefetch effect (line ~140)
- Insights/alerts effect (line ~179)
- Month summary effect (line ~187)

### Backend: Auth Dependencies (Commits a55472e4, earlier)

Added `user_id: int = Depends(get_current_user_id)` to:
- `POST /agent/tools/analytics/forecast/cashflow`
- `POST /agent/tools/analytics/kpis`
- `POST /agent/tools/analytics/anomalies`
- `POST /agent/tools/analytics/recurring`
- `POST /agent/tools/analytics/subscriptions`
- `POST /agent/tools/analytics/budget/suggest`
- `POST /agent/tools/analytics/whatif`
- `POST /agent/tools/insights/expanded`

Auth guard properly raises `HTTPException(401)` when unauthenticated.

### Build: Cache Busting
- Clean Vite cache before builds: `Remove-Item apps\web\node_modules\.vite`
- Clean dist: `Remove-Item apps\web\dist`
- Use `docker compose build --no-cache nginx`

## Testing Instructions

1. **Clear browser cache completely**:
   ```
   DevTools (F12) → Application → Clear site data
   ```

2. **Test unauthenticated**:
   - Open https://app.ledger-mind.org
   - Should see login page
   - Check Network tab: NO requests to `/agent/tools/*`

3. **Test authenticated**:
   - Log in with Google
   - Page should render with dashboard
   - Network tab should show `/agent/tools/*` returning 200 OK

4. **Test logout**:
   - Click logout
   - Should return to login page
   - NO API calls should fire

## Deployment Timeline

- **Initial deploy**: ad4199ac (E2E tests, chat fixes)
- **Backend auth fix**: a55472e4
- **BC investigation**: 74671e25, 96a38bdd, c42e542f
- **Final fix**: 9676afa3 (authReady guards)

## Lessons Learned

1. ✅ **Always check `authReady` AND `authOk`** - loading state matters
2. ✅ **Vite chunk hashes are stable** - need clean builds to force new hashes
3. ✅ **Browser cache is aggressive** - need cache busting + user instructions
4. ❌ **Don't assume first symptom is root cause** - BroadcastChannel was a red herring

## Rollback Plan

If issues persist:
```powershell
git checkout 56d250bf  # Last known good (user isolation, pre-BC changes)
docker compose -f docker-compose.prod.yml build --no-cache nginx backend
docker compose -f docker-compose.prod.yml up -d
```

## Related Files

- `apps/web/src/App.tsx` - Auth guard additions
- `apps/backend/app/routers/analytics.py` - Auth dependencies
- `apps/backend/app/routers/agent_tools_insights.py` - Auth dependencies
- `apps/backend/app/deps/auth_guard.py` - Auth guard implementation

## Monitoring

Check for these patterns:
- ✅ No 401 errors before login page interaction
- ✅ No 500 errors on `/agent/tools/*`
- ✅ No React error #185 in console
- ✅ Dashboard renders after login

---
**Status**: ✅ RESOLVED
**Deploy Time**: 2025-11-07 ~21:00 UTC
**Commits**: a55472e4, 9676afa3
