# Testing Guide

Comprehensive testing strategy for LedgerMind.

---

## Test Categories

### Backend Tests (`pnpm -C apps/backend pytest -q`)

- **Unit tests** - Services, models, utilities
- **Integration tests** - DB access, API endpoints
- **Agent tests** - Chat, tools, streaming
- **Security tests** - Auth, CSRF, encryption

### Frontend Unit Tests (`pnpm -C apps/web vitest run`)

- **Component tests** - React components with Testing Library
- **Hook tests** - Custom React hooks
- **Utility tests** - Helper functions

### E2E Tests (`pnpm -C apps/web exec playwright test`)

- **Auth flows** - Login, logout, session management
- **Dashboard** - Charts, insights, unknowns panel
- **Chat** - ChatDock streaming, tools, history
- **CSV ingest** - Upload, categorization, undo

---

## Running Tests

### Backend

```bash
cd apps/backend

# All tests
pnpm pytest -q

# Specific file
pnpm pytest tests/test_agent_chat.py -v

# Specific test
pnpm pytest tests/test_agent_chat.py::test_agent_chat_general -v

# With coverage
pnpm pytest --cov=app --cov-report=html
open htmlcov/index.html
```

### Frontend Unit

```bash
cd apps/web

# All tests
pnpm vitest run

# Watch mode
pnpm vitest

# Specific file
pnpm vitest run src/components/__tests__/ExportMenu.test.tsx

# Coverage
pnpm test:cov
```

### E2E

```bash
cd apps/web

# Install browsers (one-time)
pnpm exec playwright install --with-deps chromium

# All E2E tests
pnpm exec playwright test

# Specific test
pnpm exec playwright test tests/e2e/demo-login-simple.spec.ts

# Interactive UI mode
pnpm exec playwright test --ui

# Debug mode
pnpm exec playwright test --debug
```

---

## E2E Test Modes

### Development E2E

Tests run against local dev stack (`http://localhost:8083` or `5173`).

```bash
# Two-terminal workflow
# Terminal 1: Start backend
cd apps/backend
uvicorn app.main:app --reload

# Terminal 2: Run tests
cd apps/web
pnpm run test:fast:dev
```

### Production E2E

Tests run against live production (`https://app.ledger-mind.org`).

```bash
# Capture auth state (one-time)
cd apps/web
pnpm exec tsx tests/e2e/.auth/capture-prod-state.ts

# Run prod tests
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --project=chromium-prod
```

**See:** [`E2E_TESTS.md`](E2E_TESTS.md) for detailed E2E documentation.

---

## Test Organization

### Backend Test Structure

```
apps/backend/app/tests/
├── test_admin_*.py          # Admin endpoints
├── test_agent_*.py          # Agent/chat tests
├── test_auth_*.py           # Authentication
├── test_categorize_*.py     # Categorization logic
├── test_charts_*.py         # Chart endpoints
├── test_crypto_*.py         # Encryption tests
├── test_ingest_*.py         # CSV ingest
└── services/                # Service layer tests
```

### Frontend Test Structure

```
apps/web/
├── src/
│   └── components/
│       └── __tests__/       # Component unit tests
├── tests/
│   ├── e2e/                 # Playwright E2E tests
│   │   ├── auth/
│   │   ├── chat/
│   │   └── *.spec.ts
│   └── .auth/               # Auth state capture
```

---

## Writing Tests

### Backend Test Example

```python
def test_agent_chat_general(client, auth_headers):
    """Test general chat endpoint."""
    response = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "Hello"}],
            "intent": "general"
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert isinstance(data["reply"], str)
```

### Frontend Unit Test Example

```typescript
import { render, screen } from '@testing-library/react';
import { ExportMenu } from '../ExportMenu';

test('renders export buttons', () => {
  render(<ExportMenu month="2025-08" />);
  expect(screen.getByText(/Excel/i)).toBeInTheDocument();
  expect(screen.getByText(/PDF/i)).toBeInTheDocument();
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('demo login flow', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Try Demo');
  await expect(page).toHaveURL(/\/app/);
  await expect(page.locator('text=Dashboard')).toBeVisible();
});
```

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Every push to `main` or PR
- Separate workflows for backend, frontend, E2E

**Workflows:**
- `.github/workflows/ci.yml` - Backend + frontend unit tests
- `.github/workflows/e2e.yml` - E2E tests (dev environment)
- `.github/workflows/e2e-prod.yml` - Production smoke tests

---

## Test Data

### Fixtures

Backend tests use pytest fixtures in `conftest.py`:

```python
@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)

@pytest.fixture
def auth_headers(client):
    """Authentication headers for test user."""
    # Login and return headers
    pass
```

### Sample Data

Sample CSV files for testing:
- `apps/backend/app/data/samples/transactions_sample.csv`
- `apps/backend/sample_hints_pass3_real_data.csv`

---

## Troubleshooting

### Backend Tests Fail with DB Errors

**Symptom:** `relation "transactions" does not exist`

**Fix:**
```bash
cd apps/backend
DATABASE_URL=sqlite+pysqlite:///test.db alembic upgrade head
```

### E2E Tests Timeout

**Symptom:** Tests hang or timeout waiting for elements

**Fix:**
- Ensure backend and frontend are running
- Check `BASE_URL` environment variable
- Increase timeout in `playwright.config.ts`:
  ```ts
  use: {
    actionTimeout: 10000,
    navigationTimeout: 30000,
  }
  ```

### Flaky Tests

**Best practices:**
- Use `toBeVisible()` instead of `toBeTruthy()`
- Wait for network idle: `await page.waitForLoadState('networkidle')`
- Use data-testid attributes for stable selectors
- Avoid hard-coded sleeps, use waitFor instead

---

## Coverage Goals

- **Backend:** >80% line coverage
- **Frontend:** >70% line coverage
- **E2E:** Critical user paths covered

**View coverage:**
```bash
# Backend
cd apps/backend
pnpm pytest --cov=app --cov-report=html
open htmlcov/index.html

# Frontend
cd apps/web
pnpm test:cov
open coverage/index.html
```

---

## Next Steps

- **E2E details:** [`E2E_TESTS.md`](E2E_TESTS.md)
- **Dev setup:** [`../setup/DEV_SETUP.md`](../setup/DEV_SETUP.md)
- **CI/CD:** See `.github/workflows/`
