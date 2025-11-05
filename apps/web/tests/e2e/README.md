# E2E ML Tests

End-to-end tests for the LedgerMind ML suggestion pipeline using Playwright.

## Overview

These tests verify the complete ML workflow:
1. **Model status checks** - Query model availability and metadata
2. **Training pipeline** - Optionally train a model (with no-data tolerance)
3. **Prediction endpoint** - Test raw prediction API with structured rows
4. **Suggestions integration** - Verify metrics emission and shadow mode comparison

## Test Files

- **`ml-e2e.spec.ts`** - Main E2E test suite
  - Health checks (`/ready`)
  - Model status (`/ml/v2/model/status`)
  - Training (`/ml/v2/train`)
  - Predictions (`/ml/v2/predict`)
  - Suggestions metrics (`/agent/suggestions`, `/metrics`)

- **`waitForApp.ts`** - Utility for waiting for backend readiness

## Prerequisites

### Local Development

1. **Backend services running**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres backend
   ```

2. **Database migrated**:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend python -m alembic upgrade head
   ```

3. **Optional: Seed data** (for transaction tests):
   ```bash
   # If you have seeding scripts
   docker compose -f docker-compose.prod.yml exec backend python scripts/seed-dev-data.py
   ```

4. **Playwright installed**:
   ```bash
   cd apps/web
   pnpm install
   pnpm exec playwright install --with-deps chromium
   ```

## Running Tests

### Local Execution

**Run all E2E ML tests**:
```bash
cd apps/web
pnpm test:e2e:ml
```

**Run with custom BASE_URL**:
```bash
BASE_URL=http://localhost:8000 pnpm test:e2e:ml
```

**Run with custom transaction ID**:
```bash
TXN_ID=123 BASE_URL=http://localhost:8000 pnpm test:e2e:ml
```

**Run with limited training rows (faster)**:
```bash
ML_TRAIN_LIMIT=5000 BASE_URL=http://localhost:8000 pnpm test:e2e:ml
```

**Debug mode (headed browser)**:
```bash
BASE_URL=http://localhost:8000 pnpm exec playwright test tests/e2e/ml-e2e.spec.ts --headed
```

**Interactive UI mode**:
```bash
BASE_URL=http://localhost:8000 pnpm exec playwright test tests/e2e/ml-e2e.spec.ts --ui
```

### CI Execution

Tests run automatically on push/PR via `.github/workflows/e2e-ml.yml`.

**Trigger manually**:
- Go to GitHub Actions → "E2E ML Tests" → "Run workflow"

**Environment variables in CI**:
- `BASE_URL=http://localhost:8000`
- `ML_TRAIN_LIMIT=20000` (cap training for speed)
- `TXN_ID=999001` (known seeded transaction)

## Test Scenarios

### 1. Model Status & Training

```typescript
test('ml status → optional train → status (no-data tolerant)', async () => {
  // Checks /ready health
  // Queries /ml/v2/model/status (before)
  // Attempts /ml/v2/train (tolerates 400 "no_data")
  // Queries /ml/v2/model/status (after)
});
```

**Expected outcomes**:
- `/ready` returns 200
- `/ml/v2/model/status` returns model metadata or `{"deployed": false}`
- `/ml/v2/train` returns 200 (trained) or 400 (no_data)
- Status snapshots attached as `status-before.json` and `status-after.json`

### 2. Suggestions Metrics

```typescript
test('suggestions path emits compare metrics after a request', async () => {
  // Calls /agent/suggestions with txn_id
  // Verifies /metrics includes lm_ml_* and lm_suggest_compare
});
```

**Expected outcomes**:
- `/agent/suggestions` returns 200 (or skips if auth-guarded)
- `/metrics` contains `lm_ml_` prefixes (model counters)
- `/metrics` contains `lm_suggest_compare` (rule↔model agreement)

### 3. Raw Prediction

```typescript
test('predict endpoint (raw row) returns structured output', async () => {
  // Sends POST /ml/v2/predict with feature row
  // Validates response shape
});
```

**Expected outcomes**:
- `/ml/v2/predict` returns 200
- Response has `available` boolean
- If `available=true`, includes `label` (string) and `confidence` (number)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8000` | Backend base URL |
| `ML_TRAIN_LIMIT` | `20000` | Max rows for training (CI speed cap) |
| `TXN_ID` | `999001` | Transaction ID for suggestions test |

### Playwright Config

Tests use the existing `playwright.config.ts` settings:
- Timeout: 30s per test
- Retries: 1 in CI, 0 locally
- Reporter: `line` (CI also generates HTML)
- Projects: `chromium` only

## Troubleshooting

### Backend not ready

**Symptoms**:
```
Backend not ready: 503 Service Unavailable
```

**Solutions**:
1. Verify services running: `docker compose -f docker-compose.prod.yml ps`
2. Check backend logs: `docker compose -f docker-compose.prod.yml logs backend`
3. Ensure migrations ran: `docker compose exec backend python -m alembic current`
4. Wait longer (increase timeout in `waitForApp.ts`)

### Training fails with "no_data"

**Expected behavior**: Test is **tolerant** to 400 responses with `"no_data"` message.

**Why it happens**:
- Not enough labeled transactions in `transaction_labels` table
- Database is fresh without seed data

**Solutions** (if you need training to succeed):
1. Run seed migration: `docker compose exec backend python -m alembic upgrade head`
2. Manually add labels:
   ```sql
   INSERT INTO transaction_labels (txn_id, label, source)
   SELECT id, 'Groceries', 'manual_test'
   FROM transactions
   WHERE description ILIKE '%GROCERY%'
   LIMIT 100;
   ```
3. Run with smaller limit: `ML_TRAIN_LIMIT=50`

### Suggestions endpoint returns 401/403

**Symptoms**:
```
suggestions not available: 401 Unauthorized
```

**Cause**: Endpoint requires authentication in production.

**Behavior**: Test **skips** with message (not a failure).

**Solutions**:
- For staging/dev: Disable auth temporarily (`DEV_ALLOW_NO_AUTH=1`)
- For prod E2E: Inject auth token in test:
  ```typescript
  const api = await request.newContext({
    extraHTTPHeaders: { 'Authorization': `Bearer ${testToken}` }
  });
  ```

### Transaction ID not found

**Symptoms**:
```
suggestions not available: 404 Transaction not found
```

**Solution**: Override `TXN_ID` to an existing transaction:
```bash
TXN_ID=123 pnpm test:e2e:ml
```

Check available IDs:
```sql
SELECT id FROM transactions LIMIT 10;
```

## Artifacts

On test failure, CI uploads:
- `playwright-report/` - HTML test report
- `test-results/` - Screenshots, videos, traces
- `status-before.json` - Model status before training
- `status-after.json` - Model status after training

Access via GitHub Actions → Workflow run → "Artifacts" section.

## Best Practices

1. **Keep tests fast**:
   - Use `ML_TRAIN_LIMIT` to cap training rows
   - Skip optional steps if data unavailable
   - Run serially in CI (`mode: 'serial'`)

2. **Tolerate missing data**:
   - Tests should not fail if training data is absent
   - Use conditional skips for auth-required endpoints
   - Verify endpoint shapes, not exact counts

3. **Clean state**:
   - Tests are idempotent (can run multiple times)
   - Don't assume model exists (check `available` flag)
   - Metrics are cumulative (check presence, not values)

4. **Debug efficiently**:
   - Use `--headed` for visual debugging
   - Check attached JSON artifacts for status snapshots
   - Inspect backend logs on failure

## CI/CD Integration

### GitHub Actions Workflow

`.github/workflows/e2e-ml.yml` runs on:
- Push to `main` (paths: `apps/backend/**`, `apps/web/**`)
- Pull requests (same paths)
- Manual trigger (`workflow_dispatch`)

**Steps**:
1. Checkout code
2. Set up Node 20 + pnpm
3. Install Playwright with chromium
4. Boot Postgres + backend via Docker Compose
5. Wait for `/ready` endpoint
6. Run E2E tests
7. Upload artifacts on failure
8. Cleanup containers

**Duration**: ~5-10 minutes (depends on training data size)

## Local Development Workflow

```bash
# 1. Start services
docker compose -f docker-compose.prod.yml up -d postgres backend

# 2. Wait for ready
curl -f http://localhost:8000/ready

# 3. Run tests
cd apps/web
pnpm test:e2e:ml

# 4. Debug failures
pnpm exec playwright test tests/e2e/ml-e2e.spec.ts --headed --debug

# 5. View report
pnpm exec playwright show-report
```

## Future Enhancements

- [ ] Add auth token injection for protected endpoints
- [ ] Test canary rollout (`SUGGEST_USE_MODEL_CANARY` env var)
- [ ] Verify shadow mode comparison logic
- [ ] Test model reload (`/ml/v2/model/reload`)
- [ ] Add performance benchmarks (latency thresholds)
- [ ] Test error handling (malformed requests, timeouts)

## Related Documentation

- **Backend ML**: `apps/backend/app/ml/README.md`
- **Shadow Mode**: `apps/backend/docs/ml-shadow-mode.md`
- **Canary Deployment**: `apps/backend/docs/ml-canary-deployment.md`
- **Playwright Setup**: `apps/web/playwright.config.ts`
