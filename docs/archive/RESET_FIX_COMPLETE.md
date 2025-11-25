# Reset Showing Demo Data - FIXED

## Summary

The issue where clicking "Reset Dashboard" showed demo data ($1808.89) instead of an empty dashboard has been **RESOLVED** through two critical fixes:

1. **SECURITY FIX**: Chart endpoints were querying ALL users' transactions without user_id filtering
2. **Backend Enhancement**: Reset endpoint now returns detailed counts and uses cleaner deletion logic

## Root Causes Identified

### Issue 1: Missing User Isolation (CRITICAL SECURITY BUG)
**Problem**: Chart endpoints in `agent_tools_charts.py` had NO user_id filtering:
- `charts_summary`
- `charts_merchants`
- `charts_flows`
- `spending_trends`

**Impact**: Users saw ALL users' financial data, including demo@ledger-mind.org's 72 transactions ($1808.89)

**Fix**: Added `user_id: int = Depends(get_current_user_id)` and `.filter(Transaction.user_id == user_id)` to all chart queries

### Issue 2: CSRF Import Bug (Already Fixed)
**Problem**: `UploadCsv.tsx` was importing bare `fetchJSON` without CSRF support

**Fix**: Changed to `import { fetchJSON } from "@/lib/http"` (with automatic CSRF header injection)

### Issue 3: Reset Endpoint Could Be Cleaner
**Problem**: Complex deletion logic with explicit split/label queries

**Fix**: Simplified to delete transactions only, relying on database CASCADE for related records

## Changes Deployed

### Backend Image: `ledgermind-backend:main-reset-clean`

**File**: `apps/backend/app/routers/ingest.py`
- Simplified deletion logic (lines 932-954)
- Returns `{"ok": True, "deleted": <count>}` instead of complex object
- Relies on database foreign key CASCADE for splits/labels/links

**File**: `apps/backend/app/routers/agent_tools_charts.py`
- Added user_id filtering to ALL chart endpoints
- Each endpoint now only returns current user's data

### Frontend Image: `ledgermind-web:main-fix-csrf` (Already Deployed)

**File**: `apps/web/src/components/UploadCsv.tsx`
- Fixed import to use `@/lib/http` (with CSRF support)

### Nginx Configuration: (Already Deployed)

**File**: `deploy/nginx.conf`
- Forwards `Cookie` header
- Forwards `X-CSRF-Token` header
- Passes through `Set-Cookie` header

## Testing Instructions

### 1. Verify User Isolation

After reset, you should see ZERO transactions, not demo data:

```bash
# Check your transaction count (should be 0 after reset)
docker exec lm-postgres psql -U lm -d lm -c "SELECT user_id, email, COUNT(*) as txn_count FROM transactions JOIN users ON transactions.user_id = users.id GROUP BY user_id, email;"
```

Expected output:
```
 user_id |         email          | txn_count
---------+------------------------+-----------
       6 | demo@ledger-mind.org   |        72
```

Your user (id=3 leoklemet.pa@gmail.com) should NOT appear if you've already reset.

### 2. Test Reset Flow

1. **Upload Sample Data**:
   - Click "Use sample data" button
   - Should see transactions appear ($1808.89 or similar)

2. **Click Reset**:
   - Click "Reset Dashboard" button
   - Confirm in dialog
   - Should see success toast: "Data cleared"

3. **Verify Empty State**:
   - Overview card should show: $0 income, $0 spending, $0 net
   - Top Categories: "No category data."
   - Top Merchants: "No merchant data."
   - Daily Flows: "No flow data."
   - Spending Trends: "No historical data." or 6 months of zeros

4. **Check Browser Console**:
   - Should see: `[charts] refetched all data for month: 2025-01`
   - Should NOT see any demo data values (1808.89, etc.)

5. **Network Tab**:
   - POST to `/ingest/dashboard/reset` should return:
     ```json
     {"ok": true, "deleted": 72}
     ```
     (The number will vary based on how many sample transactions were loaded)

### 3. Test CSRF Protection

1. **Open Browser DevTools → Network tab**
2. Click "Reset Dashboard"
3. Find the POST request to `/ingest/dashboard/reset`
4. Check **Request Headers**:
   - Should include: `Cookie: access_token=...; csrf_token=...`
   - Should include: `X-CSRF-Token: <same-value-as-csrf_token-cookie>`

If CSRF token is missing, you'll see 403 with error: `{"detail": "CSRF check failed: missing header"}`

## Database Verification

Check which users have transactions:

```powershell
docker exec lm-postgres psql -U lm -d lm -c "SELECT user_id, email, COUNT(*) as txn_count FROM transactions JOIN users ON transactions.user_id = users.id GROUP BY user_id, email ORDER BY user_id;"
```

After reset, your user should have 0 transactions.

Check transaction content by user:

```powershell
# Replace 3 with your actual user_id
docker exec lm-postgres psql -U lm -d lm -c "SELECT id, description, amount, category_slug FROM transactions WHERE user_id = 3 LIMIT 5;"
```

Should return 0 rows if you've reset.

## What Changed in Code

### Before (BROKEN):
```python
# apps/backend/app/routers/agent_tools_charts.py
@router.post("/summary")
async def charts_summary(body: SummaryBody, db: Session = Depends(get_db)):
    # ❌ NO user_id filtering - returns ALL users' data
    txns = db.query(Transaction).filter(Transaction.month == body.month).all()
```

### After (FIXED):
```python
# apps/backend/app/routers/agent_tools_charts.py
@router.post("/summary")
async def charts_summary(
    body: SummaryBody,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)  # ✅ Get current user
):
    # ✅ Filter by user_id - only current user's data
    txns = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.month == body.month
    ).all()
```

## Frontend Logic (Already Correct)

The frontend has NO demo data fallback. It properly handles empty state:

```tsx
// apps/web/src/components/ChartsPanel.tsx
const hasData = s?.month || m.length > 0 || c.length > 0 || d.length > 0;
if (!hasData) {
  setEmpty(true);
  setSummary(null);
  setMerchants([]);
  setCategories([]);
  setDaily([]);
} else {
  setSummary(s);
  setMerchants(m);
  setCategories(c);
  setDaily(d);
}
```

When backend returns empty arrays (because user has 0 transactions), UI shows "No category data", "No merchant data", etc.

## Expected Behavior After Fix

1. **After Reset**: Dashboard shows $0.00 everywhere, empty state messages
2. **After Upload**: Dashboard shows your uploaded transactions only (not demo data)
3. **User Isolation**: You NEVER see demo@ledger-mind.org's transactions ($1808.89)
4. **CSRF Protection**: Reset button works without 403 errors

## Files Modified

### Backend (Deployed):
- `apps/backend/app/routers/ingest.py` - Enhanced reset endpoint
- `apps/backend/app/routers/agent_tools_charts.py` - Added user_id filtering

### Frontend (Deployed):
- `apps/web/src/components/UploadCsv.tsx` - Fixed CSRF import

### Nginx (Deployed):
- `deploy/nginx.conf` - Added Cookie and X-CSRF-Token forwarding

### Docker Compose (Updated):
- `docker-compose.prod.yml` - Updated to use `ledgermind-backend:main-reset-clean`

## Rollback Plan (If Needed)

If issues arise, rollback to previous working backend:

```powershell
cd C:\ai-finance-agent-oss-clean

# Edit docker-compose.prod.yml line 69:
# image: ledgermind-backend:main-user-filter

docker compose -f docker-compose.prod.yml up -d backend
```

The `main-user-filter` image has user_id filtering but the old reset logic.

## Next Steps

1. **Test the reset flow** following instructions above
2. **Verify empty state** shows correctly (no demo data)
3. **Check browser console** for errors
4. **Confirm CSRF headers** are present in Network tab
5. **Report any issues** with:
   - Browser console errors
   - Network tab request/response details
   - Database query results

## Success Criteria

✅ Reset clears data to empty state ($0.00 everywhere)
✅ No demo data appears ($1808.89)
✅ Charts show empty state messages ("No category data", etc.)
✅ Reset returns `{"ok": true, "deleted": N}`
✅ CSRF token present in request headers
✅ No 403 errors
✅ Database shows 0 transactions for your user after reset

---

**Deployment Status**: ✅ COMPLETE
**Backend**: ledgermind-backend:main-reset-clean
**Frontend**: ledgermind-web:main-fix-csrf
**Nginx**: Headers forwarding enabled
**Date**: 2025-01-08
