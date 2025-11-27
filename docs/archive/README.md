# LedgerMind Backend Testing Guide

## Overview

The LedgerMind backend test suite uses pytest with a hermetic test environment that provides:

- **SQLite in-memory database** for isolated test runs
- **Prometheus multiprocess mode safeguards** to prevent metric collection errors
- **Frozen time** for deterministic date/time logic
- **Environment normalization** (test mode, disabled LLM, etc.)
- **Auth fixtures** for testing authenticated endpoints

## Test Configuration

### Files

- **`conftest.py`**: Global pytest bootstrap and fixtures
  - Path setup for `app.*` imports
  - Prometheus multiprocess mode disabled
  - Unbuffered output for log assertions
  - UTC timezone normalization
  - SQLite in-memory database fixtures
  - Auth client fixtures

- **`__init__.py`**: Makes tests directory a proper Python package

- **`pytest.ini`** (repo root): Pytest configuration
  - Test discovery limited to `apps/backend/tests`
  - Import mode: `importlib`
  - Quiet output by default (`-q`)
  - Markers for test categorization

## Running Tests

### Prerequisites

Tests require dev dependencies:

```bash
# Install dev requirements (inside backend container or locally)
pip install -r apps/backend/requirements-dev.txt
```

### Basic Commands

**Run all tests:**
```bash
# From repo root
pytest apps/backend/tests/

# From apps/backend
pytest tests/

# Inside Docker (if pytest installed)
docker compose -f docker-compose.prod.yml exec backend pytest apps/backend/tests/
```

**Run specific test file:**
```bash
pytest apps/backend/tests/test_predict_runtime.py

# With verbose output
pytest -v apps/backend/tests/test_predict_runtime.py

# Stop on first failure
pytest -x apps/backend/tests/test_predict_runtime.py
```

**Run tests by marker:**
```bash
# ML tests only
pytest -m ml

# Exclude slow tests
pytest -m "not slow"

# HTTP API tests only
pytest -m httpapi
```

**Run with coverage:**
```bash
pytest --cov=app --cov-report=html apps/backend/tests/
```

### Hermetic Mode

For lightweight unit tests without HTTP dependencies:

```bash
HERMETIC=1 pytest apps/backend/tests/
```

Hermetic mode:
- Skips FastAPI app initialization
- Skips HTTP client fixtures
- Only runs unit tests (no integration/e2e)

## Test Environment

### Environment Variables

Tests automatically set these via `conftest.py`:

- `TESTING=1` - Enables test mode
- `APP_ENV=test` - Application environment
- `PYTHONUNBUFFERED=1` - Unbuffered output for logs
- `TZ=UTC` - Stable timezone
- `PROMETHEUS_MULTIPROC_DIR` - **Removed** to prevent collection errors
- `DEV_ALLOW_NO_LLM=1` - Skip real LLM calls
- `DEV_ALLOW_NO_AUTH=0` - Use real auth (tests can override)
- `DEV_ALLOW_NO_CSRF=1` - Skip CSRF validation
- `ENCRYPTION_ENABLED=0` - Skip encryption init
- `TEST_MODE=1` - Enables test-specific behavior

### Database

Tests use an **in-memory SQLite database** via `_force_sqlite_for_all_tests` fixture:

- Created fresh per session
- Isolated from production Postgres
- Fast (no disk I/O)
- Cleaned between tests

**Note:** Some Postgres-specific features (JSON operators, regex) may behave differently in SQLite.

## Fixtures

### Core Fixtures

**`client`** - Authenticated FastAPI TestClient (admin role)
```python
def test_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
```

**`client_user`** - TestClient with regular user role
```python
def test_user_access(client_user):
    response = client_user.get("/api/transactions")
    assert response.status_code == 200
```

**`client_admin`** - TestClient with admin role
```python
def test_admin_access(client_admin):
    response = client_admin.get("/api/admin/users")
    assert response.status_code == 200
```

**`db_session`** - Direct SQLAlchemy session for DB operations
```python
def test_create_transaction(db_session):
    from app.orm_models import Transaction
    import datetime

    txn = Transaction(
        date=datetime.date.today(),
        amount=-50.0,
        description="Test transaction"
    )
    db_session.add(txn)
    db_session.commit()
    assert txn.id is not None
```

**`auth_client`** - Client with JWT Authorization header
```python
def test_rules_save(auth_client):
    response = auth_client.post(
        "/api/rules",
        json={"pattern": "GROCERY", "category": "Groceries"}
    )
    assert response.status_code == 200
```

### ML Testing Fixtures

For ML runtime tests, use monkeypatching to mock model loading:

```python
def test_predict_row(monkeypatch):
    from app.ml.runtime import predict_row, _load_latest

    class FakeModel:
        def predict_one(self, row):
            return {"label": "Groceries", "confidence": 0.91}

    monkeypatch.setattr(
        "app.ml.runtime._load_latest",
        lambda: (FakeModel(), {"run_id": "test"})
    )

    result = predict_row({"merchant": "HARRIS TEETER"})
    assert result["available"] is True
    assert result["label"] == "Groceries"
```

## Test Organization

### Test Markers

Tests are organized by markers (defined in `pytest.ini`):

- `@pytest.mark.ml` - ML suggestion flow tests
- `@pytest.mark.agent_tools` - Agent tool endpoints
- `@pytest.mark.httpapi` - Requires FastAPI app
- `@pytest.mark.slow` - Long-running tests
- `@pytest.mark.integration` - Cross-endpoint integration
- `@pytest.mark.needs_llm` - Requires live LLM
- `@pytest.mark.crypto` - Encryption/crypto tests

### Test Structure

```
apps/backend/tests/
├── conftest.py              # Global fixtures & bootstrap
├── __init__.py              # Package marker
├── test_*.py                # Unit/integration tests
├── helpers/                 # Test utilities
│   ├── auth_jwt.py         # JWT minting helpers
│   └── ...
└── README.md               # This file
```

## Common Patterns

### Testing Protected Endpoints

```python
def test_protected_route(client):
    # client fixture is already authenticated as admin
    response = client.get("/api/admin/dashboard")
    assert response.status_code == 200
```

### Testing Unauthenticated Access

```python
def test_no_auth(client, monkeypatch):
    # Override to remove auth
    monkeypatch.setenv("DEV_ALLOW_NO_AUTH", "1")

    response = client.get("/api/public")
    assert response.status_code == 200
```

### Testing with Database

```python
def test_transaction_creation(db_session):
    from app.orm_models import Transaction
    import datetime

    txn = Transaction(
        date=datetime.date(2025, 11, 4),
        amount=-100.0,
        description="TEST MERCHANT",
        tenant_id=1
    )
    db_session.add(txn)
    db_session.commit()

    assert txn.id is not None
    assert txn.month == "2025-11"
```

### Testing Metrics

```python
def test_metrics_increment():
    from prometheus_client import REGISTRY

    # Get initial value
    before = _get_counter_value("lm_ml_predict_total")

    # Perform operation that increments counter
    from app.ml.runtime import predict_row
    predict_row({"merchant": "TEST"})

    # Verify increment
    after = _get_counter_value("lm_ml_predict_total")
    assert after > before

def _get_counter_value(name):
    from prometheus_client import REGISTRY
    for metric in REGISTRY.collect():
        if metric.name == name:
            for sample in metric.samples:
                return sample.value
    return 0
```

## Troubleshooting

### Import Errors

If you see `ModuleNotFoundError: No module named 'app'`:

1. Check `sys.path` includes `apps/backend`
2. Run from repo root: `pytest apps/backend/tests/`
3. Or use `PYTHONPATH=apps/backend pytest tests/`

### Prometheus Errors

If you see "Duplicated timeseries in CollectorRegistry":

- Verify `PROMETHEUS_MULTIPROC_DIR` is not set in test environment
- Check `conftest.py` removes it: `os.environ.pop("PROMETHEUS_MULTIPROC_DIR", None)`

### Database Errors

If tests interfere with each other:

- Ensure `db_session` fixture is used (creates clean DB per test)
- Check `_reset_in_memory_state` fixture clears app state
- Verify no tests write to production DATABASE_URL

### Missing Dependencies

If pytest not found in container:

```bash
# Backend tests require dev dependencies
docker compose -f docker-compose.prod.yml exec backend pip install -r requirements-dev.txt

# Or build a dev image:
docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml exec backend pytest
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Backend Tests
  run: |
    cd apps/backend
    pip install -r requirements-dev.txt
    pytest -v --cov=app --cov-report=xml tests/

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./apps/backend/coverage.xml
```

### Docker-based Testing

```bash
# Run tests in production container (if pytest installed)
docker compose -f docker-compose.prod.yml exec backend pytest -q apps/backend/tests/

# Or use test-specific script (no pytest required)
docker compose -f docker-compose.prod.yml exec backend python scripts/test-predict-runtime.py
```

## Best Practices

1. **Use fixtures** - Don't create clients/sessions manually
2. **Test deltas** - Measure metric changes, not absolute values
3. **Mock external deps** - Monkeypatch LLM, KMS, external APIs
4. **Clean state** - Use `db_session` fixture, don't pollute global state
5. **Mark appropriately** - Use markers for categorization
6. **Fast by default** - Keep unit tests under 1s each
7. **Hermetic when possible** - Prefer unit tests over integration

## Examples

See these test files for patterns:

- **`test_predict_runtime.py`** - ML runtime unit tests with monkeypatching
- **`test_suggestions_canary.py`** - Shadow mode canary tests
- **`test_*.py`** - Various endpoint and service tests

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [FastAPI testing guide](https://fastapi.tiangolo.com/tutorial/testing/)
- [SQLAlchemy testing patterns](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html#joining-a-session-into-an-external-transaction-such-as-for-test-suites)
