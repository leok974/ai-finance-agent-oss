# User Data Isolation - Implementation Started

**Date**: 2025-11-07
**Status**: 🚧 PHASE 1 COMPLETE - CRITICAL SECURITY WORK IN PROGRESS
**Priority**: 🔴 HIGH - Multi-user data leakage prevention

---

## What Was Done

### ✅ Phase 1: Schema & Auth Foundation (COMPLETE)

1. **Database Migration Created**
   - File: `apps/backend/alembic/versions/20251107_add_user_id_to_transactions.py`
   - Adds `user_id` column to transactions table
   - Creates foreign key to `users.id` with CASCADE delete
   - Adds index for query performance
   - Initially NULLABLE (requires manual backfill before making NOT NULL)

2. **ORM Model Updated**
   - File: `apps/backend/app/orm_models.py`
   - Added `user_id: Mapped[int | None]` to Transaction class
   - Configured FK constraint with CASCADE delete
   - Marked as TODO: Make NOT NULL after backfill

3. **Auth Dependencies Enhanced**
   - File: `apps/backend/app/deps/auth_guard.py`
   - Added `get_current_user_email()` - Extract email from session
   - Added `get_current_user_id_from_email()` - Get DB user ID
   - Ready for use in route dependencies

4. **Implementation Plan Documented**
   - File: `USER_ISOLATION_IMPLEMENTATION.md`
   - Comprehensive 8-phase plan with code examples
   - Security checklist and rollback procedures
   - Progress tracking and testing strategy

---

## What's Left (Phases 2-8)

### ⏳ Phase 2: Router Layer (~10 files)
Update all API endpoints to:
- Accept `user_id` from auth dependency
- Filter queries by `user_id`
- Set `user_id` on record creation

**Files**:
- `app/routers/transactions.py` - List, get, create, update, delete
- `app/routers/charts.py` - All chart endpoints
- `app/routers/ingest.py` - CSV upload sets ownership
- `app/routers/agent_tools_*.py` - Agent tool queries
- `app/routers/ml.py` - ML/suggestions endpoints

### ⏳ Phase 3: Service Layer (~15 files)
Add `user_id` parameter to all service functions:
- `app/services/charts.py`
- `app/services/analytics.py`
- `app/services/explain.py`
- `app/services/suggest/serve.py`
- All other services querying transactions

### ⏳ Phase 4: Cache Layer (~5 files)
Update cache keys to include user_id:
```python
# OLD: "summary:2024-11"
# NEW: "user:123:summary:2024-11"
```

**Critical**: Purge all non-scoped cache keys after deployment

### ⏳ Phase 5: Response Headers (1 middleware)
Add `Cache-Control: private, no-store` to all data endpoints

### ⏳ Phase 6: Frontend (2-3 files)
Show empty state when user has no transactions:
```typescript
const hasData = useQuery('/transactions?limit=1');
return hasData ? <Dashboard /> : <UploadPanel />;
```

### ⏳ Phase 7: Testing (2 new test files)
- Backend: `tests/test_user_isolation.py`
- E2E: `tests/e2e/multi-user-isolation.spec.ts`

### ⏳ Phase 8: Data Cleanup (Manual SQL)
Backfill existing transactions with user_id:
```sql
UPDATE transactions SET user_id = <YOUR_ID> WHERE user_id IS NULL;
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
```

---

## How to Continue

### Option 1: Complete Implementation Now
Estimated time: 8-12 hours of focused work

```bash
# 1. Run migration
cd apps/backend
alembic upgrade head

# 2. Backfill data
psql -d finance_agent -c "UPDATE transactions SET user_id = 1 WHERE user_id IS NULL;"
psql -d finance_agent -c "ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;"

# 3. Update routers (use implementation plan as guide)
# Start with apps/backend/app/routers/transactions.py
# Follow pattern from USER_ISOLATION_IMPLEMENTATION.md

# 4. Test
pytest apps/backend/tests/test_user_isolation.py
pnpm test:e2e multi-user-isolation.spec.ts

# 5. Deploy
```

### Option 2: Incremental Rollout
1. Deploy Phase 1 changes (migration + model)
2. Backfill data in production
3. Deploy router/service changes incrementally
4. Monitor each deploy for issues

### Option 3: Feature Flag
Wrap new logic in feature flag for safer rollout:
```python
USE_USER_ISOLATION = os.getenv("USE_USER_ISOLATION", "false") == "true"

if USE_USER_ISOLATION and user_id:
    q = q.filter(Transaction.user_id == user_id)
```

---

## Critical Notes

### ⚠️ DO NOT Deploy Partially
This is a security-critical change. Either:
- Complete all phases before deploying, OR
- Use feature flag to disable until ready

### ⚠️ Performance Consideration
Current auth dependency queries DB on every request:
```python
get_current_user_id_from_email() -> SELECT * FROM users WHERE email=...
```

Consider:
1. Store `user_id` in session cookie (best)
2. Add Redis cache for email→user_id mapping
3. Use JWT with embedded user_id claim

### ⚠️ Cache Poisoning Risk
After deployment, **immediately** purge all non-user-scoped cache keys:
```python
import redis
r = redis.from_url(REDIS_URL)
for pattern in ["summary:*", "chart:*", "trends:*"]:
    for key in r.scan_iter(pattern):
        r.delete(key)
```

---

## Testing Strategy

### Before Deploying
1. Run migration on dev/staging
2. Backfill test data
3. Run full test suite:
   ```bash
   pytest apps/backend/tests/
   pnpm test:e2e
   ```
4. Manual smoke test with 2 users

### After Deploying
1. Monitor logs for 401 errors
2. Check that users can only see their data
3. Verify charts/analytics work correctly
4. Test new user signup → upload → view data flow

---

## Rollback Plan

If issues arise:

### Database
```bash
cd apps/backend
alembic downgrade 20251105_reconcile_ml_schema
```

### Code
```bash
git revert HEAD  # Or specific commit
docker compose -f docker-compose.prod.yml up -d --build
```

### Emergency Mitigation
Deploy middleware that blocks all data access:
```python
@app.middleware("http")
async def emergency_lock(request, call_next):
    if request.url.path.startswith(("/transactions", "/charts")):
        return JSONResponse({"error": "Maintenance mode"}, 503)
    return await call_next(request)
```

---

## Files Changed So Far

- ✅ `apps/backend/alembic/versions/20251107_add_user_id_to_transactions.py` (NEW)
- ✅ `apps/backend/app/orm_models.py` (Transaction model updated)
- ✅ `apps/backend/app/deps/auth_guard.py` (Auth helpers added)
- ✅ `USER_ISOLATION_IMPLEMENTATION.md` (NEW - Full implementation guide)
- ✅ `USER_ISOLATION_STATUS.md` (NEW - This file)

**Total**: 3 files modified, 2 files created

---

## Next Action Items

1. **Immediate**: Review `USER_ISOLATION_IMPLEMENTATION.md` for full plan
2. **Before Deploy**: Complete Phases 2-7 (Routers → Services → Cache → Tests)
3. **On Deploy**: Run migration + backfill data
4. **After Deploy**: Monitor + purge old cache keys

---

## Questions to Answer

- [ ] Is this a single-user app becoming multi-user, or already multi-user with shared data?
- [ ] Should we use feature flag for safer rollout?
- [ ] Do we need to optimize auth dependency (DB query per request)?
- [ ] Should we migrate SQLite → PostgreSQL first?
- [ ] What's the timeline for completion? (Urgent vs planned)

---

**Status Summary**: Foundation is solid ✅. Ready to proceed with router/service layer updates. Estimated 8-12 hours of work remaining to complete all phases.

See `USER_ISOLATION_IMPLEMENTATION.md` for detailed implementation guide with code examples.
