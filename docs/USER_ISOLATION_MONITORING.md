# User Isolation Monitoring & Alerting Guide

**Purpose:** Catch regressions and ensure multi-user data isolation remains intact

---

## Quick Checks (Manual - 2 minutes)

### A. Cache-Control Headers
```bash
# Should return: Cache-Control: private, no-store
curl -sI https://app.ledger-mind.org/transactions?limit=1 | grep -i cache-control
```

### B. Database NULL Check
```sql
-- Should return 0
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;
```

### C. Redis Key Namespace (if using Redis)
```bash
# Old global keys (should be empty)
redis-cli --scan --pattern 'summary:*'

# New namespaced keys (should exist)
redis-cli --scan --pattern 'user:*:summary:*' | head -5
```

---

## Automated Tests

### 1. Playwright E2E: Multi-User Isolation

**File:** `apps/web/tests/e2e/user-isolation.spec.ts`

**Run:**
```bash
cd apps/web
pnpm test:pw user-isolation.spec.ts
```

**What it checks:**
- User A uploads data → sees dashboard
- User B logs in → sees empty state
- User B cannot access User A's transactions by ID
- Cache-Control headers present

**CI Integration:**
Add to `.github/workflows/test.yml`:
```yaml
- name: E2E Isolation Tests
  run: pnpm test:pw user-isolation.spec.ts --project=chromium
  working-directory: apps/web
```

### 2. Vitest: Empty State Component

**File:** `apps/web/src/components/__tests__/Dashboard.empty.spec.tsx`

**Run:**
```bash
cd apps/web
pnpm test Dashboard.empty.spec.tsx
```

**What it checks:**
- Dashboard shows empty state for users with no transactions
- Dashboard shows charts for users with transactions
- API is called with correct parameters

### 3. Backend: User Isolation Validation

**File:** `apps/backend/test_user_isolation.py`

**Run:**
```bash
cd apps/backend
.\.venv\Scripts\python.exe test_user_isolation.py
```

**What it checks:**
- Transaction queries filtered by user_id
- Chart services accept user_id parameter
- Insights services scoped by user
- Cache keys namespaced

---

## Database Hardening

### Unique Index (Prevent Cross-User Duplicates)

If you have `external_id` column:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_txn_user_external
ON transactions(user_id, external_id)
WHERE external_id IS NOT NULL;
```

**Purpose:** Prevents the same external transaction from being imported by multiple users.

### Verify NOT NULL Constraint

```sql
-- Check column is NOT NULL
SELECT
    column_name,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'user_id';
-- Expected: is_nullable = 'NO'

-- Check for any NULLs (should be 0)
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;
```

### Verify Foreign Key Cascade

```sql
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

---

## Monitoring & Alerting

### Grafana Panels

#### 1. Transactions by User (Daily)

```promql
# Count transactions per user per day
count by (user_id) (
    transactions{created_at > now() - 24h}
)
```

**Alert:** > 0 NULL user_ids detected

#### 2. Cache Hit Rate by User

```promql
# Cache performance per user
rate(cache_hits_total{user_id!=""}[5m]) /
rate(cache_requests_total{user_id!=""}[5m])
```

**Alert:** Cache hit rate < 50% for any user

#### 3. Authentication Errors

```promql
# 401/403 errors per endpoint
rate(http_requests_total{status=~"401|403"}[5m])
```

**Alert:** > 5 auth errors/min (indicates broken auth)

### Structured Logging

Add to every `/transactions` endpoint:

```python
import logging
logger = logging.getLogger(__name__)

@router.get("/transactions")
def list_transactions(user_id: int = Depends(get_current_user_id), ...):
    count = len(transactions)
    cache_hit = ... # from cache layer

    logger.info(
        "transactions_listed",
        extra={
            "user_id": user_id,
            "count": count,
            "cache_hit": cache_hit,
            "endpoint": "/transactions"
        }
    )
    return transactions
```

**Query logs:**
```bash
# Find users with sudden drops (cache poisoning indicator)
cat app.log | jq 'select(.msg=="transactions_listed") | {user_id, count, cache_hit}'
```

---

## Service Contract Enforcement

### Make user_id Required (No Defaults)

**In service layer:**

```python
def get_month_summary(db: Session, user_id: int, month: str) -> MonthSummary:
    """
    Get month summary for a specific user.

    Args:
        db: Database session
        user_id: User ID (REQUIRED - no default to force caller awareness)
        month: YYYY-MM format

    Raises:
        ValueError: If user_id is None or <= 0
    """
    if not user_id or user_id <= 0:
        raise ValueError("user_id is required and must be positive")

    # ... rest of implementation
```

**Benefits:**
- Forces developers to explicitly pass user_id
- Catches missing user_id at service boundary
- Fails fast with clear error message

### Type Hints

Use strict typing:

```python
from typing import Optional

# BAD (allows None):
def get_summary(db: Session, user_id: Optional[int] = None):
    pass

# GOOD (requires value):
def get_summary(db: Session, user_id: int):
    pass
```

---

## CI/CD Integration

### Pre-Deployment Checks

**In CI pipeline (`.github/workflows/deploy.yml`):**

```yaml
- name: Isolation Tests
  run: |
    cd apps/backend
    python test_user_isolation.py

- name: Frontend E2E
  run: |
    cd apps/web
    pnpm test:pw user-isolation.spec.ts

- name: Database Check
  run: |
    cd apps/backend
    python -c "from app.db import SessionLocal; from sqlalchemy import text; db = SessionLocal(); nulls = db.execute(text('SELECT COUNT(*) FROM transactions WHERE user_id IS NULL')).scalar(); assert nulls == 0, f'Found {nulls} NULL user_ids'; print('✅ No NULL user_ids'); db.close()"
```

### Post-Deployment Verification

```yaml
- name: Production Spot-Check
  run: |
    pwsh scripts/prod-spot-checks.ps1 -BaseUrl "https://app.ledger-mind.org"
```

---

## Regression Detection

### Symptoms of Broken Isolation

1. **User sees empty dashboard after previously having data**
   - Likely cause: Cache keys not namespaced
   - Check: Redis keys missing user_id

2. **User sees another user's data**
   - Likely cause: Missing user_id filter in query
   - Check: SQL query logs for missing WHERE user_id = ...

3. **Sudden spike in 401/403 errors**
   - Likely cause: get_current_user_id dependency missing
   - Check: Application logs, endpoint signatures

4. **Cache hit rate drops to 0%**
   - Likely cause: Cache key format changed
   - Check: help_cache.make_key() signature

### Quick Diagnosis

```bash
# Check if user_id is in cache keys
redis-cli keys "*" | grep -c "user:"

# Check if queries have user_id filter
grep -r "WHERE.*user_id" apps/backend/app/services/

# Check if endpoints use get_current_user_id
grep -r "get_current_user_id" apps/backend/app/routers/
```

---

## Runbook: Incident Response

### If Cross-User Data Leakage Detected

1. **Immediate:** Disable affected endpoint
   ```python
   @router.get("/transactions")
   def list_transactions(...):
       raise HTTPException(503, "Temporarily disabled for maintenance")
   ```

2. **Investigate:** Check recent changes
   ```bash
   git log --oneline --since="24 hours ago" -- apps/backend/app/routers/ apps/backend/app/services/
   ```

3. **Verify:** Run isolation tests
   ```bash
   python test_user_isolation.py
   ```

4. **Fix:** Add user_id filter to affected query

5. **Deploy:** Re-enable endpoint after verification

6. **Monitor:** Watch logs for 24 hours

---

## Success Metrics

- **Zero** NULL user_ids in database
- **Zero** cross-user data access incidents
- **< 0.1%** authentication error rate
- **> 80%** cache hit rate per user
- **100%** isolation tests passing in CI

---

## Resources

- **Validation Script:** `apps/backend/test_user_isolation.py`
- **E2E Tests:** `apps/web/tests/e2e/user-isolation.spec.ts`
- **Component Tests:** `apps/web/src/components/__tests__/Dashboard.empty.spec.tsx`
- **Spot-Check Script:** `scripts/prod-spot-checks.ps1`
- **Deployment Guide:** `docs/USER_ISOLATION_DEPLOYMENT_CHECKLIST.md`

---

**Last Updated:** 2025-11-07
**Status:** Active Monitoring
