# ML Suggestions Deployment & Testing Runbook

Complete workflow for deploying and testing the ML suggestions API.

## Quick Reference

```bash
# 1. Build and deploy
docker compose -f docker-compose.prod.yml up -d --build backend nginx
docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini upgrade head

# 2. Quick smoke test
make smoke-ml

# 3. Backend contract tests
cd apps/backend && pytest -q tests/test_suggestions_api.py

# 4. (Optional) E2E tests with dev token
cd apps/web && BASE_URL=http://localhost LM_DEV_ENABLE_TOKEN=dev pnpm test:fast tests/e2e/transactions-suggestions.spec.ts
```

---

## 1. Deployment

### Build & Start Services
```bash
# From project root
docker compose -f docker-compose.prod.yml up -d --build backend nginx
```

### Run Migrations
```bash
# Apply all pending migrations (including FK and index additions)
docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini upgrade head
```

**Expected migrations:**
- `20251103_suggestions` - Create base tables
- `20251103_suggestions_fk` - Add FK constraint with CASCADE
- `20251103_suggestions_idx_created_at` - Add created_at index

### Verify Services
```bash
# Check container health
docker compose -f docker-compose.prod.yml ps

# Expected: backend and nginx should show "healthy" status
```

---

## 2. Smoke Testing

### Quick Makefile Smoke Test
```bash
# Default (http://localhost)
make smoke-ml

# Custom URL
make smoke-ml BASE_URL=http://localhost:8080
```

### Manual PowerShell Smoke Test
```powershell
# Full test script (suggestions + feedback + metrics)
.\apps\backend\scripts\test-suggestions-api.ps1

# Expected output:
# ✅ Got event_id: <uuid>
# ✅ Feedback accepted
# ✅ Reject feedback sent
# === Test Complete ===
```

### Manual Bash Smoke Test
```bash
# Unix/Mac/Git Bash
./apps/backend/scripts/test-suggestions-api.sh

# Expected: Similar output to PowerShell version
```

---

## 3. Backend Contract Tests

### Run All Suggestion Tests
```bash
cd apps/backend
pytest -q tests/test_suggestions_api.py
```

### Test Coverage
Tests include:
- ✅ Happy path with valid transaction IDs
- ✅ Multiple transactions in one request
- ✅ Integer and string ID acceptance
- ✅ Invalid ID rejection (400 error)
- ✅ Null ID handling
- ✅ Empty list handling
- ✅ Non-existent transaction IDs
- ✅ Feedback accept flow
- ✅ Feedback reject flow
- ✅ Invalid event ID handling

### Run with Verbose Output
```bash
pytest -v tests/test_suggestions_api.py
```

### Run Single Test
```bash
pytest tests/test_suggestions_api.py::test_suggestions_happy_path -v
```

---

## 4. End-to-End (E2E) Tests

### Prerequisites
E2E tests require:
1. Full application stack running
2. Frontend development server or production build
3. Dev unlock token (if enabled)

### Configure Playwright for Dev Token

**File:** `apps/web/playwright.config.ts`

```typescript
use: {
  baseURL: process.env.BASE_URL || 'http://localhost',
  extraHTTPHeaders: {
    'x-dev-token': process.env.LM_DEV_ENABLE_TOKEN ?? '',
  }
}
```

### Run E2E Tests

```bash
cd apps/web

# With dev token
BASE_URL=http://localhost LM_DEV_ENABLE_TOKEN=your_dev_token pnpm test:fast tests/e2e/transactions-suggestions.spec.ts

# Without dev token (if not required)
BASE_URL=http://localhost pnpm test:fast tests/e2e/transactions-suggestions.spec.ts
```

### E2E Test Environment Variables
- `BASE_URL` - Application URL (default: http://localhost)
- `LM_DEV_ENABLE_TOKEN` - Dev unlock token for protected routes
- `E2E_TXN_ID` - Transaction ID to use in tests (default: 999001)

---

## 5. Monitoring & Metrics

### Check Prometheus Metrics
```bash
# View all ML suggestion metrics
curl -s http://localhost/metrics | grep lm_suggestions

# Check for errors
curl -s http://localhost/metrics | grep lm_http_errors
```

### Key Metrics to Monitor
- `lm_suggestions_total{mode,source}` - Total suggestions generated
- `lm_suggestions_covered_total` - Transactions receiving suggestions
- `lm_suggestions_accept_total{label}` - Accepted suggestions by category
- `lm_suggestions_reject_total{label}` - Rejected suggestions by category
- `lm_suggestions_latency_ms` - Endpoint latency histogram
- `lm_http_errors_total{route}` - 5xx errors by route

### Prometheus Alerts

**File:** `ops/prometheus/rules/suggestions.yml`

Configured alerts:
1. **LmSuggestionsHigh5xx** - Fires after 10min of 5xx errors
2. **LmSuggestionsLowAcceptRate** - Fires if accept rate < 45% for 30min
3. **LmSuggestionsHighLatency** - Fires if p95 > 1000ms for 15min
4. **LmSuggestionsCoverageDrop** - Fires if coverage < 70% for 30min

---

## 6. Grafana Dashboards

### Useful PromQL Queries

**Model vs Heuristic Live Rate:**
```promql
# Model live rate
sum(rate(lm_suggestions_total{mode="model",source="live"}[5m]))

# Heuristic live rate
sum(rate(lm_suggestions_total{mode="heuristic",source="live"}[5m]))
```

**Accept Rate (Win-rate proxy):**
```promql
sum(rate(lm_suggestions_accept_total{mode="model"}[30m]))
/
(sum(rate(lm_suggestions_accept_total{mode="model"}[30m])) + sum(rate(lm_suggestions_accept_total{mode="heuristic"}[30m])) + 1e-6)
```

**Error Rate:**
```promql
rate(lm_http_errors_total{route="/ml/suggestions"}[5m])
```

**Latency Percentiles:**
```promql
histogram_quantile(0.50, rate(lm_suggestions_latency_ms_bucket[5m]))  # p50
histogram_quantile(0.95, rate(lm_suggestions_latency_ms_bucket[5m]))  # p95
histogram_quantile(0.99, rate(lm_suggestions_latency_ms_bucket[5m]))  # p99
```

---

## 7. Troubleshooting

### Backend Not Starting
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend --tail=50

# Common issues:
# - Migration failures: Check alembic logs
# - Database connection: Verify postgres is healthy
# - Import errors: Check for Python syntax errors
```

### 500 Errors from API
```bash
# Check backend logs for Python traceback
docker compose -f docker-compose.prod.yml logs backend --tail=100 | grep -A 20 "Traceback"

# Check error metrics
curl -s http://localhost/metrics | grep lm_http_errors
```

### Smoke Test Failures
```bash
# Verify transactions exist
docker compose -f docker-compose.prod.yml exec postgres psql -U myuser -d finance -c "SELECT id, merchant, category FROM transactions WHERE id IN (999001, 999002, 999003, 999004, 999005);"

# Expected: 5 rows with NULL categories
```

### Migration Not Applied
```bash
# Check current version
docker compose -f docker-compose.prod.yml exec postgres psql -U myuser -d finance -c "SELECT version_num FROM alembic_version;"

# Manually run migrations
docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini upgrade head
```

### FK Constraint Violations
```bash
# Verify FK exists
docker compose -f docker-compose.prod.yml exec postgres psql -U myuser -d finance -c "\d suggestion_events"

# Expected output should show: fk_suggestion_events_txn FOREIGN KEY (txn_id) REFERENCES transactions(id) ON DELETE CASCADE
```

---

## 8. Rollback Procedures

### Rollback Migrations
```bash
# Rollback to before FK constraint
docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini downgrade 20251103_suggestions

# Rollback to before suggestions tables
docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini downgrade 20251103_preserve_ml
```

### Rollback Code Changes
```bash
# Rebuild from previous tag/commit
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml up -d --build backend nginx
```

---

## 9. Performance Benchmarks

### Expected Performance
- **Latency:** p50 < 100ms, p95 < 500ms, p99 < 1000ms
- **Coverage:** > 80% of transactions receive suggestions
- **Accept Rate:** > 50% (indicates good suggestion quality)
- **Error Rate:** < 0.1% (less than 1 error per 1000 requests)

### Load Testing (Optional)
```bash
# Simple load test with ApacheBench
ab -n 1000 -c 10 -T 'application/json' -p payload.json http://localhost/ml/suggestions

# payload.json:
# {"txn_ids": ["999001"], "top_k": 3, "mode": "auto"}
```

---

## 10. Maintenance Tasks

### Clean Old Suggestion Events
```sql
-- Delete events older than 90 days
DELETE FROM suggestion_events
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM ANALYZE suggestion_events;
VACUUM ANALYZE suggestion_feedback;
```

### Regenerate Indexes
```sql
-- If query performance degrades
REINDEX TABLE suggestion_events;
REINDEX TABLE suggestion_feedback;
```

### Check Table Sizes
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('suggestion_events', 'suggestion_feedback')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Summary Checklist

- [ ] Backend and nginx containers healthy
- [ ] All migrations applied successfully
- [ ] FK constraint verified in database
- [ ] Smoke test passes (`make smoke-ml`)
- [ ] Contract tests pass (pytest)
- [ ] E2E tests pass (if applicable)
- [ ] Metrics visible in Prometheus
- [ ] Alert rules loaded
- [ ] Grafana dashboards configured
- [ ] Documentation updated
