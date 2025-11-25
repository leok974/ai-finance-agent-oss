# Test Failure Investigation & Fix

## Issue
The smoke test was failing with 1/5 tests:
```
✗ FAIL: Invalid month format (expected 422, got 500)
```

## Root Cause
The `_month_bounds()` function in `explain.py` was calling `datetime(year, month, 1)` which raises a `ValueError` when month is outside 1-12 range (e.g., month=13).

FastAPI's `Query(..., regex=r"^\d{4}-\d{2}$")` only validates the **format** (YYYY-MM), not the **logical validity** of the month number.

## Solution

### 1. Added Month Validation in `_month_bounds()`
```python
def _month_bounds(yyyymm: str):
    """
    Convert YYYY-MM to (start, end) datetimes.

    Raises:
        ValueError: If month is not in 1-12 range
    """
    year, month = map(int, yyyymm.split("-"))

    # Validate month range
    if not (1 <= month <= 12):
        raise ValueError(f"Month must be between 1 and 12, got {month}")

    # ... rest of function
```

### 2. Added ValueError Handler in Router
```python
try:
    if panel_id == "charts.month_merchants":
        data = explain_month_merchants(db, month)
    # ... other explainers
except ValueError as e:
    # Invalid month value (e.g., month=13)
    raise HTTPException(
        status_code=422,
        detail=f"Invalid month value: {str(e)}"
    )
```

## Test Results - After Fix

### All Tests Pass ✓
```
✓ PASS  All Explainer Endpoints     (5/5 panels)
✓ PASS  Cache Behavior              (2.2x speedup)
✓ PASS  Redis Connectivity          (7 keys, TTL working)
✓ PASS  Metrics Tracking            (3 metric families)
✓ PASS  Error Handling              (2/2 cases)

Overall: 5/5 tests passed
🎉 All tests passed! System is production-ready.
```

### Specific Fix Validation
```bash
# Test invalid month=13
GET /agent/describe/charts.month_merchants?month=2025-13

# Before fix:
Status: 500
Response: {"detail": "Internal server error"}

# After fix:
Status: 422
Response: {"detail": "Invalid month value: Month must be between 1 and 12, got 13"}
```

## Files Modified
- `apps/backend/app/services/explain.py` - Added month range validation
- `apps/backend/app/routers/agent_describe.py` - Added ValueError exception handler

## Impact
- ✅ Proper HTTP 422 status code for invalid month values
- ✅ Clear error messages to users
- ✅ All smoke tests passing
- ✅ No breaking changes to existing functionality
