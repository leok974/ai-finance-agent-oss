# Demo Mode Implementation - Backend Changes Required

## Overview
This document outlines the backend endpoints that need the `?demo=1` query parameter to support demo mode.

## Pattern to Apply

```python
from app.core.demo import resolve_user_for_mode

@router.get("/endpoint")
def handler(
    user_id: int = Depends(get_current_user_id),
    demo: bool = Query(False, description="Use demo user data instead of current user"),
    db: Session = Depends(get_db),
):
    """
    Args:
        demo: If True, fetch data for demo user (DEMO_USER_ID) instead of current user.
    """
    effective_user_id, include_demo = resolve_user_for_mode(user_id, demo)

    # Use effective_user_id instead of user_id in all queries
    result = some_service(db, effective_user_id, ...)
    return result
```

## Endpoints to Update

### charts.py ✅ PARTIALLY DONE
- [x] `/charts/month_summary` - Added demo parameter (needs complete testing)
- [ ] `/charts/month-merchants` - Need to add demo parameter
- [ ] `/charts/month-flows` - Need to add demo parameter
- [ ] `/charts/spending-trends` - Need to add demo parameter
- [ ] `/charts/category-timeseries` - Need to add demo parameter

### insights.py
- [ ] All insight endpoints - Need to add demo parameter

### transactions.py
- [ ] `/transactions` list endpoint - Need to add demo parameter
- [ ] Any transaction summary endpoints - Need to add demo parameter

### analytics.py
- [ ] Dashboard analytics endpoints - Need to add demo parameter

## Service Layer Changes

The service functions (in `app/services/`) also need to accept an `include_demo` parameter:

```python
def load_month(db: Session, user_id: int, month: date, *, include_demo: bool = True) -> MonthAgg:
    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
    )
    if not include_demo:
        q = q.filter(Transaction.is_demo.is_(False))
    # ...
```

**Note**: For now, when `demo=True`, we switch to `DEMO_USER_ID`, so all transactions for that user are demo data. The `include_demo` filter becomes less critical, but should be kept for future flexibility.

## Testing

After applying changes:

1. Test with demo=false (default): Should show user's own data
2. Test with demo=true: Should show demo user's data (DEMO_USER_ID=1)
3. Verify no cross-contamination between real and demo data

## Migration Path

Phase 1 (Current):
- Added demo mode infrastructure (migration, models, config, demo.py helper)
- Updated CSV ingest to never create demo data for real users
- Updated demo seed to only populate DEMO_USER_ID
- Added demo parameter to one chart endpoint as example

Phase 2 (TODO):
- Apply demo parameter pattern to all remaining chart endpoints
- Apply to insights endpoints
- Apply to transaction list endpoints
- Update service layer functions to accept include_demo parameter

Phase 3 (Frontend):
- Add demoMode state management
- Update data hooks to send ?demo=1 when in demo mode
- Update "Use sample data" button to enable demo mode
- Update demo banner to use demoMode flag

## Quick Reference

```bash
# Check demo user exists
psql $DATABASE_URL -c "SELECT id, email, is_demo_user FROM users WHERE email='demo@ledger-mind.local';"

# Check demo transactions
psql $DATABASE_URL -c "SELECT COUNT(*), source FROM transactions WHERE user_id=1 GROUP BY source;"

# Verify real user transactions aren't marked as demo
psql $DATABASE_URL -c "SELECT user_id, COUNT(*), is_demo, source FROM transactions WHERE user_id != 1 GROUP BY user_id, is_demo, source;"
```
