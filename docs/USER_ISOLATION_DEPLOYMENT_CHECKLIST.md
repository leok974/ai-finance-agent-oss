# User Isolation Deployment Checklist

**Date:** 2025-11-07
**Status:** ✅ COMPLETE - All phases deployed
**Priority:** HIGH - Security Fix

## Pre-Deployment Checklist

- [x] Phase 1 complete (schema, ORM, auth dependency)
- [x] Phase 2 complete (Charts router & services)
- [x] Phase 3 complete (Agent & Insights routers)
- [x] Phase 4 complete (Budget router)
- [x] Phase 5 complete (Upload & Ingest)
- [x] Phase 6 complete (Cache & Headers)
- [x] Phase 7 complete (Testing & Validation - 4/4 tests passed)
- [x] Phase 8 complete (Guard middleware removed)
- [x] All tests passing (backend validation script)
- [ ] Staging environment available
- [ ] Database backup taken
- [ ] Rollback plan reviewed

---

## Step 1: Database Migration + Backfill (5-10 mins)

### 1.1 Run Alembic Migration

```bash
cd apps/backend
alembic upgrade head
```

**Verify migration succeeded:**
```sql
-- Check column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'user_id';

-- Expected: user_id | integer | YES
```

### 1.2 Backfill User IDs

**⚠️ Replace with your actual admin email:**

```sql
-- Find your user ID first
SELECT id, email FROM users WHERE email = 'leo@example.com';

-- Backfill all NULL transactions to your user
WITH me AS (SELECT id FROM users WHERE email = 'leo@example.com')
UPDATE transactions
SET user_id = (SELECT id FROM me)
WHERE user_id IS NULL;

-- Verify no NULLs remain
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;
-- Expected: 0
```

### 1.3 Make Column NOT NULL

```sql
-- After verifying all rows have user_id
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;

-- Verify constraint
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'user_id';
-- Expected: NO
```

**✅ Checkpoint:** All transactions now have user_id (NOT NULL)

---

## Step 2: Deploy Temporary Leak Guard (2 mins)

**File:** `apps/backend/app/main.py`

Add this middleware BEFORE all other middleware:

```python
@app.middleware("http")
async def guard_user_isolation(request: Request, call_next):
    """Temporary guard: block unauthenticated access to user data endpoints.

    Remove this after Phases 2-3 (router/service filtering) are complete.
    """
    # Gate any endpoints that touch user data
    if request.url.path.startswith(("/transactions", "/charts", "/agent", "/rules", "/budget")):
        from app.utils.auth import get_current_user
        from fastapi.responses import JSONResponse

        try:
            # Extract user from session (your existing auth)
            user = await get_current_user(request)
            if not user or not user.id:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required"}
                )
            # Store for downstream use
            request.state.user_id = user.id
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid session"}
            )

    return await call_next(request)
```

**Test the guard:**
```bash
# Should return 401 without session
curl -I http://localhost:8000/transactions

# Should work with valid session cookie
curl -I -H "Cookie: lm_session=..." http://localhost:8000/transactions
```

**✅ Checkpoint:** Unauthenticated requests blocked

---

## Step 3: Update Routers (Phase 2 - 30-60 mins)

Apply this pattern to **every** router that reads/writes transactions:

### 3.1 List Endpoints

```python
# BEFORE
@router.get("/transactions")
def list_txns(db: Session = Depends(get_db), ...):
    return db.query(Transaction).order_by(Transaction.posted_at.desc()).limit(100).all()

# AFTER
from fastapi import Depends
from app.deps.auth_guard import get_current_user_id

@router.get("/transactions")
def list_txns(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    ...
):
    q = (db.query(Transaction)
           .filter(Transaction.user_id == user_id)  # ✅ Scope by user
           .order_by(Transaction.posted_at.desc())
           .limit(100))
    return q.all()
```

### 3.2 Create/Write Endpoints

```python
# Ingest CSV, manual create, etc.
@router.post("/transactions")
def create_txn(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    data: TransactionCreate = ...,
):
    txn = Transaction(**data.dict(), user_id=user_id)  # ✅ Set owner
    db.add(txn)
    db.commit()
    return txn
```

### 3.3 By-ID Endpoints (Get/Update/Delete)

```python
@router.get("/transactions/{txn_id}")
def get_txn(
    txn_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    txn = db.get(Transaction, txn_id)

    # ✅ Verify ownership
    if not txn or txn.user_id != user_id:
        raise HTTPException(404, "Transaction not found")

    return txn
```

### 3.4 Files to Update

**Mandatory (~10 files):**
- [ ] `app/routers/transactions.py` - All CRUD endpoints
- [ ] `app/routers/charts.py` - Summary, merchants, flows, trends
- [ ] `app/routers/agent.py` - All agent tool endpoints
- [ ] `app/routers/rules.py` - Rules CRUD + apply
- [ ] `app/routers/budget.py` - Budget endpoints
- [ ] `app/routers/analytics.py` - KPIs, forecast, anomalies
- [ ] `app/routers/upload.py` - CSV ingest (set user_id on create)
- [ ] `app/routers/insights.py` - Insights endpoints
- [ ] `app/routers/suggestions.py` - Rule suggestions
- [ ] `app/routers/categories.py` - If touches transactions

**Test after each file:**
```bash
# Should only see your data
curl -H "Cookie: lm_session=..." http://localhost:8000/transactions
```

**✅ Checkpoint:** All routers enforce user_id filtering

---

## Step 4: Update Services (Phase 3 - 30-60 mins)

Add `user_id` parameter to all service functions that query transactions:

```python
# BEFORE
def get_month_summary(db: Session, month: str) -> MonthSummary:
    txns = db.query(Transaction).filter(Transaction.month == month).all()
    ...

# AFTER
def get_month_summary(db: Session, user_id: int, month: str) -> MonthSummary:
    txns = (db.query(Transaction)
              .filter(Transaction.user_id == user_id)  # ✅ Scope
              .filter(Transaction.month == month)
              .all())
    ...
```

**Files to update (~15 files):**
- [ ] `app/services/transactions.py`
- [ ] `app/services/charts.py`
- [ ] `app/services/analytics.py`
- [ ] `app/services/rules.py`
- [ ] `app/services/budget.py`
- [ ] `app/services/insights.py`
- [ ] `app/services/ml/*.py` (if queries transactions)

**✅ Checkpoint:** All services scoped by user_id

---

## Step 5: Update Cache Keys (Phase 4 - 15 mins)

### 5.1 Namespace Cache Keys by User

```python
# BEFORE
def k_summary(month: str):
    return f"summary:{month}"

# AFTER
def k_summary(user_id: int, month: str):
    return f"user:{user_id}:summary:{month}"
```

**Pattern for all keys:**
- `user:{user_id}:summary:{month}`
- `user:{user_id}:chart:merchants:{month}`
- `user:{user_id}:trends:{months_back}`
- `user:{user_id}:budget:{month}`

### 5.2 Purge Old Global Keys

**⚠️ Run this ONCE after deployment:**

```python
# In Python shell or one-time script
import redis
r = redis.from_url("redis://localhost:6379")

# Purge old global keys
patterns = [
    "summary:*",
    "chart:*",
    "merchants:*",
    "trends:*",
    "budget:*",
    "insights:*",
]

for pattern in patterns:
    for key in r.scan_iter(pattern):
        r.delete(key)
        print(f"Deleted: {key}")
```

**✅ Checkpoint:** Cache keys namespaced, old keys purged

---

## Step 6: Add Cache-Control Headers (Phase 5 - 5 mins)

### Option A: Per-Route (Recommended)

```python
@router.get("/transactions")
def list_txns(...):
    data = ...
    return Response(
        content=json.dumps(data),
        media_type="application/json",
        headers={"Cache-Control": "private, no-store"}
    )
```

### Option B: Middleware (Quick)

Add to `app/main.py`:

```python
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)

    # Add private cache headers for user data endpoints
    if request.url.path.startswith(("/transactions", "/charts", "/agent", "/rules", "/budget")):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Pragma"] = "no-cache"

    return response
```

**✅ Checkpoint:** User data not cached by proxies/browsers

---

## Step 7: Frontend Empty State (Phase 6 - 10 mins)

**File:** `apps/web/src/pages/Dashboard.tsx` (or equivalent)

```tsx
import { useQuery } from '@tanstack/react-query';
import { fetchJSON } from '@/lib/http';

export function Dashboard() {
  const { data: hasTxns, isLoading } = useQuery({
    queryKey: ['has-transactions'],
    queryFn: async () => {
      const txns = await fetchJSON<Transaction[]>('transactions', {
        query: { limit: 1 }
      });
      return txns && txns.length > 0;
    }
  });

  if (isLoading) return <LoadingSpinner />;

  if (!hasTxns) {
    return (
      <EmptyState>
        <h2>Welcome! Upload your first CSV</h2>
        <UploadPanel />
      </EmptyState>
    );
  }

  return <DashboardCharts />;
}
```

**✅ Checkpoint:** New users see upload prompt, not empty charts

---

## Step 8: Add Isolation Tests (Phase 7 - 20 mins)

### 8.1 Backend Pytest

**File:** `apps/backend/tests/test_user_isolation.py`

```python
import pytest
from app.orm_models import Transaction

def test_isolation_list(client_a, client_b, db):
    """User A cannot see User B's transactions in list endpoints."""
    # Seed: A has txn_A; B has txn_B
    txn_a = Transaction(id=1, user_id=client_a.user_id, amount=100, posted_at="2024-01-01")
    txn_b = Transaction(id=2, user_id=client_b.user_id, amount=200, posted_at="2024-01-01")
    db.add_all([txn_a, txn_b])
    db.commit()

    r = client_a.get("/transactions")
    assert r.status_code == 200

    ids = {t["id"] for t in r.json()}
    assert 1 in ids, "User A should see their own transaction"
    assert 2 not in ids, "User A should NOT see User B's transaction"

def test_isolation_by_id(client_a, client_b, db):
    """User A cannot access User B's transaction by ID."""
    txn_b = Transaction(id=9, user_id=client_b.user_id, amount=900, posted_at="2024-01-01")
    db.add(txn_b)
    db.commit()

    r = client_a.get("/transactions/9")
    assert r.status_code in (403, 404), "User A should not access User B's transaction"
```

**Run tests:**
```bash
cd apps/backend
pytest tests/test_user_isolation.py -v
```

### 8.2 Frontend Playwright

**File:** `apps/web/tests/e2e/user-isolation.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test("multi-user isolation", async ({ browser }) => {
  // Create two separate browser contexts (different users)
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // User A logs in and uploads data
  await pageA.goto('/');
  await loginAs(pageA, 'leo@example.com', 'password123');
  await pageA.getByTestId('upload-csv-button').click();
  await uploadCsv(pageA, 'fixtures/sample-transactions.csv');

  // Verify User A sees their dashboard
  await expect(pageA.getByText(/Total Spend/i)).toBeVisible();
  await expect(pageA.getByText(/\$1,234/)).toBeVisible();

  // User B logs in
  await pageB.goto('/');
  await loginAs(pageB, 'friend@example.com', 'password456');

  // Verify User B sees empty state (no data from User A)
  await expect(pageB.getByText(/Upload Transactions CSV/i)).toBeVisible();
  await expect(pageB.getByText(/Total Spend/i)).toHaveCount(0);
  await expect(pageB.getByText(/\$1,234/)).toHaveCount(0);

  // Cleanup
  await contextA.close();
  await contextB.close();
});
```

**Run test:**
```bash
cd apps/web
pnpm test:e2e user-isolation.spec.ts
```

**✅ Checkpoint:** Isolation tests pass

---

## Step 9: Remove Temporary Guard (Final)

**After** all router/service updates are complete and tests pass:

**File:** `apps/backend/app/main.py`

```python
# Remove the guard_user_isolation middleware added in Step 2
# @app.middleware("http")  # ❌ DELETE THIS
# async def guard_user_isolation(request, call_next):  # ❌ DELETE THIS
#     ...  # ❌ DELETE THIS
```

**✅ Checkpoint:** Temporary guard removed, isolation enforced by routers

---

## Nice-to-Have Enhancements

### A. Prevent Duplicate External Imports

```sql
-- If you have external_id column
CREATE UNIQUE INDEX IF NOT EXISTS ux_txn_user_external
ON transactions(user_id, external_id)
WHERE external_id IS NOT NULL;
```

### B. Verify CASCADE Delete

```sql
-- Already set in migration, but verify:
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'transactions'
  AND kcu.column_name = 'user_id';

-- Expected: delete_rule = 'CASCADE'
```

### C. Add Telemetry

```python
# In analytics events, include user_id (hashed for privacy)
import hashlib

def hash_user_id(user_id: int) -> str:
    return hashlib.sha256(f"user:{user_id}".encode()).hexdigest()[:12]

# Example usage
telemetry.track('transaction_viewed', {
    'user_hash': hash_user_id(user_id),
    'count': len(transactions)
})
```

---

## Rollout Order (Safe Deployment)

### Phase A: Staging Deployment

1. [ ] Deploy code with temporary guard + user_id filters
2. [ ] Run migration + backfill + NOT NULL
3. [ ] Purge old cache keys
4. [ ] Deploy frontend empty state
5. [ ] Run both isolation tests (pytest + playwright)
6. [ ] Manual smoke test with 2 users

### Phase B: Production Deployment

1. [ ] Database backup
2. [ ] Deploy backend (with guard)
3. [ ] Run migration + backfill + NOT NULL
4. [ ] Monitor logs for 401 errors (indicates auth issues)
5. [ ] Purge cache keys
6. [ ] Deploy frontend
7. [ ] Run isolation tests against prod (or staging with prod DB copy)
8. [ ] Monitor for 24 hours
9. [ ] Remove temporary guard

---

## Rollback Plan

### If Issues Detected

**Step 1: Roll back code** (keeps schema changes)
```bash
# Backend
git checkout <previous-commit>
# Deploy previous version

# Frontend
git checkout <previous-commit>
# Deploy previous version
```

**Step 2: Make user_id nullable again** (emergency only)
```sql
-- WARNING: This re-opens the security hole
ALTER TABLE transactions ALTER COLUMN user_id DROP NOT NULL;
```

**Step 3: Investigate**
- Check logs for auth failures
- Verify user_id is set correctly on all new transactions
- Test authentication flow
- Review router changes

---

## Verification Checklist

After deployment, verify:

- [ ] All transactions have user_id (no NULLs)
- [ ] User A cannot see User B's data in any endpoint
- [ ] User A cannot access User B's data by ID
- [ ] New transactions get user_id set automatically
- [ ] Cache keys include user_id
- [ ] Responses have `Cache-Control: private, no-store`
- [ ] Frontend shows empty state for new users
- [ ] Backend tests pass
- [ ] Frontend E2E tests pass
- [ ] No 401/403 errors in logs (for authenticated users)
- [ ] Performance acceptable (user_id filter indexed)

---

## Support & Monitoring

**Metrics to Watch:**
- 401/403 error rate (should be near zero for authenticated users)
- Transaction query latency (user_id index should keep it fast)
- Cache hit rate (will drop initially after key purge, then recover)

**Logs to Monitor:**
```bash
# Check for authentication errors
grep "401\|403" /var/log/app.log | wc -l

# Check for missing user_id on new transactions
grep "user_id.*NULL" /var/log/app.log
```

**Database Queries for Validation:**
```sql
-- Count transactions per user
SELECT user_id, COUNT(*)
FROM transactions
GROUP BY user_id
ORDER BY COUNT(*) DESC;

-- Check for any NULLs (should be 0)
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;

-- Verify index is being used
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE user_id = 1
ORDER BY posted_at DESC
LIMIT 100;
-- Should show "Index Scan using ix_transactions_user_id"
```

---

## Timeline Estimate

- **Phase 1** (Schema): ✅ Complete
- **Step 1-2** (DB + Guard): 15 mins
- **Step 3-4** (Routers + Services): 2-3 hours
- **Step 5-7** (Cache + Headers + Frontend): 30 mins
- **Step 8** (Tests): 30 mins
- **Step 9** (Remove guard): 5 mins

**Total: 3-4 hours of focused work**

---

## Success Criteria

✅ **Security:**
- No user can access another user's data
- All endpoints enforce user_id filtering
- Cache keys prevent cross-user poisoning

✅ **Performance:**
- Query latency < 100ms (indexed user_id)
- Cache hit rate > 80% (after warm-up)

✅ **UX:**
- New users see upload prompt
- Existing users see their data
- No false 401/403 errors

---

**Status:** Ready for deployment
**Risk Level:** Medium (requires careful testing)
**Rollback Time:** < 5 minutes (code revert)
**Estimated Downtime:** 0 (rolling deployment)
