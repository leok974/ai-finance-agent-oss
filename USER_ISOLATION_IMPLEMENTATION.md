# Multi-User Data Isolation Implementation Plan

**Status**: 🚧 IN PROGRESS
**Date**: 2025-11-07
**Priority**: 🔴 CRITICAL SECURITY FIX

---

## Overview

This document outlines the implementation of strict user data isolation to prevent data leakage between users. Before this change, all transaction data was shared across the application.

## Phase 1: Schema & Models ✅

### 1.1 Database Migration
**File**: `apps/backend/alembic/versions/20251107_add_user_id_to_transactions.py`
**Status**: ✅ Created

```python
# Migration adds:
- user_id column (nullable initially)
- Foreign key to users.id with CASCADE delete
- Index on user_id for performance
- Comments for manual backfill step
```

**Manual Steps Required**:
```sql
-- After running migration, backfill existing data:
UPDATE transactions SET user_id = <YOUR_USER_ID> WHERE user_id IS NULL;

-- Then make column NOT NULL:
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
```

### 1.2 ORM Model
**File**: `apps/backend/app/orm_models.py`
**Status**: ✅ Updated

```python
class Transaction(Base):
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=True
    )  # TODO: Make NOT NULL after backfill
```

### 1.3 Auth Dependencies
**File**: `apps/backend/app/deps/auth_guard.py`
**Status**: ✅ Updated

Added helper functions:
- `get_current_user_email()` - Extract email from session
- `get_current_user_id_from_email()` - Get DB user ID from email

**⚠️ Performance Note**: Current implementation queries DB on every request. Consider:
1. Storing `user_id` in session cookie
2. Adding Redis cache for email→user_id mapping
3. Using JWT with embedded user_id claim

---

## Phase 2: Router Layer (IN PROGRESS)

### 2.1 Transaction Endpoints
**File**: `apps/backend/app/routers/transactions.py`
**Status**: ⏳ TODO

Pattern to apply:
```python
from app.deps.auth_guard import get_current_user_id_from_email

@router.get("/transactions")
def list_transactions(
    user_id: int = Depends(get_current_user_id_from_email),
    db: Session = Depends(get_db_session),
    ...
):
    # ✅ REQUIRED: Filter by user_id
    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    ...
```

**Endpoints to update**:
- `GET /transactions` - List with user filter
- `GET /transactions/{id}` - Verify ownership
- `PUT /transactions/{id}` - Verify ownership
- `DELETE /transactions/{id}` - Verify ownership
- `POST /transactions` - Set user_id on create

### 2.2 Charts Endpoints
**File**: `apps/backend/app/routers/charts.py`
**Status**: ⏳ TODO

Pattern:
```python
@router.get("/charts/summary")
def month_summary(
    month: str,
    user_id: int = Depends(get_current_user_id_from_email),
):
    return service.compute_summary(month=month, user_id=user_id)  # ✅ Pass user_id
```

**Endpoints to update**:
- `GET /charts/summary`
- `GET /charts/month-flows`
- `GET /charts/cashflow`
- `GET /charts/trends`
- `GET /charts/merchants`
- All other chart endpoints

### 2.3 Ingest Endpoints
**File**: `apps/backend/app/routers/ingest.py`
**Status**: ⏳ TODO

Pattern:
```python
@router.post("/ingest/csv")
def ingest_csv(
    file: UploadFile,
    user_id: int = Depends(get_current_user_id_from_email),
    db: Session = Depends(get_db_session),
):
    rows = parse_csv(file)
    for r in rows:
        txn = Transaction(
            **r,
            user_id=user_id  # ✅ Set owner on creation
        )
        db.add(txn)
    db.commit()
```

### 2.4 Agent/ML Endpoints
**Files**:
- `apps/backend/app/routers/agent_tools_*.py`
- `apps/backend/app/routers/ml.py`
- `apps/backend/app/routers/suggestions.py`

**Status**: ⏳ TODO

All queries must filter by `user_id`.

---

## Phase 3: Service Layer

### 3.1 Service Functions
**Files**: `apps/backend/app/services/**/*.py`
**Status**: ⏳ TODO

Every service function that accesses transactions must:
1. Accept `user_id: int` parameter
2. Filter all queries by `user_id`
3. Document the parameter

Example:
```python
def compute_month_summary(db: Session, month: str, user_id: int) -> dict:
    """
    Compute financial summary for a specific month.

    Args:
        db: Database session
        month: YYYY-MM format
        user_id: Owner of transactions (REQUIRED for multi-user isolation)
    """
    txns = db.query(Transaction).filter(
        Transaction.user_id == user_id,  # ✅ User filter
        Transaction.month == month
    ).all()
    ...
```

**Services to update**:
- `app/services/charts.py`
- `app/services/analytics.py`
- `app/services/explain.py`
- `app/services/suggest/serve.py`
- All other services querying transactions

---

## Phase 4: Cache Layer

### 4.1 Cache Key Generation
**Files**: Any file using Redis/cache
**Status**: ⏳ TODO

Pattern:
```python
def cache_key_for_summary(user_id: int, month: str) -> str:
    """Generate user-scoped cache key."""
    return f"user:{user_id}:summary:{month}"

def cache_key_for_chart(user_id: int, chart_type: str, month: str) -> str:
    return f"user:{user_id}:chart:{chart_type}:{month}"
```

**⚠️ CRITICAL**: After deploying user_id filtering:
1. Purge ALL existing non-scoped cache keys
2. Or add user_id to all existing keys and mark old keys as expired

**Cleanup Script** (run once after deploy):
```python
# Clear all non-user-scoped cache keys
import redis
r = redis.from_url(REDIS_URL)
for pattern in ["summary:*", "chart:*", "trends:*"]:
    for key in r.scan_iter(pattern):
        r.delete(key)
```

---

## Phase 5: Response Headers

### 5.1 Cache-Control Headers
**Files**: All data route handlers
**Status**: ⏳ TODO

Add to all endpoints returning user data:
```python
from fastapi import Response

@router.get("/transactions")
def list_transactions(..., response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    # ✅ Prevents browser/proxy caching of user data
    ...
```

**Or use middleware**:
```python
# In app/main.py or middleware file
@app.middleware("http")
async def set_private_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/transactions", "/charts", "/agent")):
        response.headers["Cache-Control"] = "private, no-store"
    return response
```

---

## Phase 6: Frontend

### 6.1 Empty State Logic
**Files**:
- `apps/web/src/components/Dashboard.tsx` (or equivalent)
- `apps/web/src/pages/Home.tsx`

**Status**: ⏳ TODO

```typescript
const { data: hasTransactions } = useQuery(
  ['has-transactions'],
  () => api.get('/transactions?limit=1')
);

const showEmptyState = !hasTransactions || hasTransactions.items.length === 0;

return (
  <div>
    {showEmptyState ? (
      <UploadTransactionsPanel />
    ) : (
      <Dashboard />
    )}
  </div>
);
```

---

## Phase 7: Testing

### 7.1 Backend Tests (Pytest)
**File**: `apps/backend/tests/test_user_isolation.py` (NEW)
**Status**: ⏳ TODO

```python
def test_user_cannot_see_others_transactions(client_a, client_b, seed_data):
    """Verify users can only see their own transactions."""
    # Seed: User A has transaction ID 100
    # Seed: User B has transaction ID 200

    r_a = client_a.get("/transactions")
    assert 100 in [t["id"] for t in r_a.json()["items"]]
    assert 200 not in [t["id"] for t in r_a.json()["items"]]

    r_b = client_b.get("/transactions")
    assert 200 in [t["id"] for t in r_b.json()["items"]]
    assert 100 not in [t["id"] for t in r_b.json()["items"]]

def test_user_cannot_access_others_transaction_by_id(client_a, client_b):
    """Verify user A cannot access user B's transaction directly."""
    # Seed: User B has transaction ID 200

    r = client_a.get("/transactions/200")
    assert r.status_code == 404  # Or 403 Forbidden
```

### 7.2 E2E Tests (Playwright)
**File**: `apps/web/tests/e2e/multi-user-isolation.spec.ts` (NEW)
**Status**: ⏳ TODO

```typescript
test("multi-user data isolation", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // Login as two different users
  await loginAs(pageA, "leo@example.com");
  await loginAs(pageB, "friend@example.com");

  // Upload data as user A
  await pageA.goto("/");
  await uploadCsv(pageA, "user-a-transactions.csv");
  await expect(pageA.getByText(/Total Spend/)).toBeVisible();

  // Verify user B sees empty state (no access to A's data)
  await pageB.goto("/");
  await expect(pageB.getByText(/Upload Transactions CSV/)).toBeVisible();
  await expect(pageB.getByText(/Total Spend/)).not.toBeVisible();
});
```

---

## Phase 8: Data Cleanup & Migration

### 8.1 Production Cleanup Options

**Option A: Assign all to primary user** (Recommended if you're the only user)
```sql
-- Get your user_id first
SELECT id, email FROM users WHERE email = 'leo@example.com';
-- Returns: id=1

-- Assign all transactions to you
UPDATE transactions SET user_id = 1 WHERE user_id IS NULL;

-- Verify
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;
-- Should be 0

-- Make column NOT NULL
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
```

**Option B: Delete unowned rows** (If data is test/junk)
```sql
DELETE FROM transactions WHERE user_id IS NULL;
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
```

**Option C: SQLite → PostgreSQL migration** (If currently on SQLite)
1. Export from SQLite: `sqlite3 data.db .dump > backup.sql`
2. Set up PostgreSQL
3. Re-ingest CSVs with proper user_id
4. More robust for production

### 8.2 Verification Queries

After cleanup, verify:
```sql
-- All transactions have owners
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;
-- Expected: 0

-- Check distribution
SELECT user_id, COUNT(*) as txn_count
FROM transactions
GROUP BY user_id;

-- Verify FK constraint works
SELECT t.id, t.user_id, u.email
FROM transactions t
LEFT JOIN users u ON t.user_id = u.id
WHERE u.id IS NULL;
-- Expected: 0 rows (no orphaned transactions)
```

---

## Rollback Plan

If issues arise:

### 1. Database Rollback
```bash
cd apps/backend
alembic downgrade -1  # Reverts last migration
```

### 2. Code Rollback
```bash
git revert <commit-hash>
# Or checkout previous commit:
git checkout <previous-commit>
```

### 3. Emergency Mitigation (Stop the Leak)
Add temporary guard at top of route handlers:
```python
# EMERGENCY GUARD - Remove after proper fix
from app.deps.auth_guard import get_current_user_id_from_email

@app.middleware("http")
async def emergency_user_guard(request: Request, call_next):
    if request.url.path.startswith(("/transactions", "/charts")):
        try:
            # Force authentication check
            user_id = get_current_user_id_from_email(...)
            # Attach to request state for downstream use
            request.state.user_id = user_id
        except:
            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required"}
            )
    return await call_next(request)
```

---

## Progress Tracking

| Phase | Status | Files Changed | Test Coverage |
|-------|--------|---------------|---------------|
| 1. Schema & Models | ✅ Complete | 2 files | N/A |
| 2. Router Layer | ⏳ TODO | ~10 files | 0% |
| 3. Service Layer | ⏳ TODO | ~15 files | 0% |
| 4. Cache Layer | ⏳ TODO | ~5 files | 0% |
| 5. Response Headers | ⏳ TODO | 1 middleware | 0% |
| 6. Frontend | ⏳ TODO | 2-3 files | 0% |
| 7. Testing | ⏳ TODO | 2 new files | 0% |
| 8. Data Cleanup | ⏳ TODO | Manual SQL | N/A |

**Estimated Time**: 8-12 hours of focused work

---

## Security Checklist

Before marking complete, verify:

- [ ] All `/transactions` endpoints filter by `user_id`
- [ ] All `/charts` endpoints filter by `user_id`
- [ ] All `/agent` endpoints filter by `user_id`
- [ ] Ingest sets `user_id` on new records
- [ ] Cache keys include `user_id` namespace
- [ ] Response headers include `private, no-store`
- [ ] Tests verify cross-user isolation
- [ ] All existing transactions assigned to owners
- [ ] `user_id` column is NOT NULL
- [ ] No legacy code bypasses user filtering

---

## Next Steps

1. **Run Migration**:
   ```bash
   cd apps/backend
   alembic upgrade head
   ```

2. **Backfill Data**:
   ```sql
   UPDATE transactions SET user_id = 1 WHERE user_id IS NULL;
   ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
   ```

3. **Update Routers** (Start with transactions.py as template)

4. **Update Services** (Pass user_id through all layers)

5. **Test Thoroughly** (Both unit and E2E)

6. **Deploy to Production**

7. **Monitor** for any 401 errors or data access issues

---

**⚠️ CRITICAL**: This is a breaking security change. Do NOT deploy partially. Complete all phases or none.
