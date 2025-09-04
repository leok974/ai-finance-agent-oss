# Test Suite for ML Suggestion Flow

This folder contains regression tests for the ML suggestion feature (`/ml/suggest`).

## Test Scenarios

- `test_ml_suggest_empty_month_contract`
  - Ensures an empty month returns a well-formed object:
    ```json
    { "month": "2099-01", "suggestions": [] }
    ```

- `test_ml_suggest_happy_path_returns_candidates`
  - Seeds labeled training rows.
  - Ingests similar unlabeled rows.
  - Asserts `/ml/suggest` returns non-empty candidates, and none are `"Unknown"`.

- `test_ml_suggest_label_then_empty`
  - Uses `/ml/suggest` to discover unlabeled txns.
  - Labels them via API (`/txns/categorize` bulk if available, else per-txn).
  - Verifies a second call to `/ml/suggest` is empty for that month.

Together these tests lock in the ML contract:
1. Empty → empty results.
2. Unlabeled → suggestions appear.
3. After labeling → suggestions disappear.

## Running Tests

Run all ML tests:

```powershell
# from repo root
cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_ml_suggest_suite.py
```
