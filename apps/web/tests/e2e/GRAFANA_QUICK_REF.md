# Grafana E2E Tests Quick Reference

## Test Suites

### 1. Grafana Datasources (`grafana-ml.spec.ts`)
**Purpose**: Validate backend metrics and Grafana datasource proxies

**Tests**:
- ✅ Warm traffic → metrics presence (always runs)
- ⏭️ JSON API datasource proxy (optional, requires credentials)
- ⏭️ Prometheus query via Grafana (optional, requires credentials)

**Run**:
```bash
BASE_URL=http://localhost:8000 GRAFANA_URL=https://grafana.example.com GRAFANA_API_KEY=xxx pnpm test:e2e:grafana
```

### 2. Dashboard Structure (`grafana-dashboard.spec.ts`)
**Purpose**: Validate ML dashboard exists with expected panels

**Tests**:
- Dashboard search (or auto-import)
- Panel structure validation
- Metric query presence checks
- Datasource variable validation

**Run**:
```bash
GRAFANA_URL=https://grafana.example.com GRAFANA_API_KEY=xxx pnpm test:e2e:grafana:dash
```

**Auto-import**:
```bash
GRAFANA_IMPORT_IF_MISSING=1 GRAFANA_DASH_JSON_PATH=ops/grafana/my-dashboard.json pnpm test:e2e:grafana:dash
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Backend (datasource tests)** ||||
| `BASE_URL` | Yes* | `http://localhost:8000` | Backend API URL |
| **Grafana (all tests)** ||||
| `GRAFANA_URL` | Yes** | - | Grafana instance URL |
| `GRAFANA_API_KEY` | Yes** | - | Service account token |
| **Datasource selection** ||||
| `GRAFANA_JSON_DS_NAME` | No | First found | JSON API datasource name |
| `GRAFANA_PROM_DS_NAME` | No | First found | Prometheus datasource name |
| **Dashboard tests** ||||
| `GRAFANA_DASH_TITLE` | No | `LedgerMind — ML Suggestions` | Dashboard title |
| `GRAFANA_IMPORT_IF_MISSING` | No | `0` | Auto-import if not found |
| `GRAFANA_DASH_JSON_PATH` | No | `ops/grafana/...` | Dashboard JSON path |
| **Other** ||||
| `TXN_ID` | No | `999001` | Transaction ID for suggestions |

\* Required for datasource tests  
\** Required for all Grafana tests (gracefully skips if not set)

## Quick Start

### Minimal (Backend metrics only)
```bash
# Start backend
docker compose -f docker-compose.prod.yml up -d postgres backend

# Run datasource test (backend only)
cd apps/web
BASE_URL=http://localhost:8000 pnpm test:e2e:grafana
# ✅ Metrics test passes
# ⏭️ Grafana tests skipped
```

### Full Suite (With Grafana)
```bash
# Set Grafana credentials
export GRAFANA_URL=https://your-grafana.example.com
export GRAFANA_API_KEY=eyJrIjoi...

# Run all tests
cd apps/web
BASE_URL=http://localhost:8000 pnpm test:e2e:grafana
pnpm test:e2e:grafana:dash
```

### CI/CD
Add GitHub secrets:
- `GRAFANA_URL`
- `GRAFANA_API_KEY`
- `GRAFANA_JSON_DS_NAME` (optional)
- `GRAFANA_PROM_DS_NAME` (optional)

Tests run automatically via `.github/workflows/e2e-ml.yml`

## Expected Metrics

### Backend `/metrics` Endpoint

| Metric | Description |
|--------|-------------|
| `lm_ml_predict_requests_total` | Total prediction requests |
| `lm_ml_predict_available_total` | Predictions with model |
| `lm_ml_predict_unavailable_total` | Predictions without model |
| `lm_ml_train_val_f1_macro` | Model validation F1 score |
| `lm_suggest_compare_total{agree="true"}` | Rule-model agreement |
| `lm_suggest_compare_total{agree="false"}` | Rule-model disagreement |

### Dashboard Panels

Expected queries in ML Suggestions dashboard:
- `lm_ml_train_val_f1_macro` - Model quality gauge
- `lm_ml_predict_requests_total` - Prediction traffic counter
- `lm_suggest_compare_total` - Shadow mode comparison

## Common Patterns

### Test Backend Only (No Grafana)
```bash
BASE_URL=http://localhost:8000 pnpm test:e2e:grafana
```
Result: Backend metrics validated, Grafana tests skipped

### Test Grafana Only (No Backend)
```bash
GRAFANA_URL=xxx GRAFANA_API_KEY=xxx pnpm test:e2e:grafana:dash
```
Result: Dashboard structure validated

### Import Dashboard if Missing
```bash
GRAFANA_IMPORT_IF_MISSING=1 \
GRAFANA_DASH_JSON_PATH=ops/grafana/ml_suggestions_dashboard.json \
pnpm test:e2e:grafana:dash
```
Result: Dashboard created if not found, then validated

### Debug Specific Test
```bash
pnpm exec playwright test tests/e2e/grafana-ml.spec.ts --grep "Warm traffic" --headed
```

### View Artifacts
```bash
pnpm exec playwright show-report
```

## Token Creation

**Grafana → Administration → Service accounts**

1. Create service account: "E2E Tests"
2. Add role: **Viewer** (or **Editor** if importing dashboards)
3. Generate token
4. Copy token value
5. Set as `GRAFANA_API_KEY`

**Minimum permissions**:
- Viewer: Read dashboards, datasources, queries
- Editor: Import dashboards (if using auto-import)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend not ready | Check `docker compose ps`, verify `/ready` endpoint |
| Grafana 403 | Token needs Viewer role minimum |
| Dashboard not found | Set `GRAFANA_DASH_TITLE` or enable import |
| Datasource not found | Install plugin, configure datasource |
| Metrics empty | Generate traffic first, wait for Prometheus scrape |
| Import 412 conflict | Dashboard UID already exists, check title |

## Files

```
apps/web/tests/e2e/
├── grafana-ml.spec.ts          # Datasource tests
├── grafana-dashboard.spec.ts   # Dashboard tests
├── GRAFANA.md                  # Full documentation
└── README.md                   # E2E suite overview
```

## Related Commands

```bash
# Run all E2E tests
pnpm test:e2e:ml              # ML pipeline
pnpm test:e2e:grafana         # Grafana datasources
pnpm test:e2e:grafana:dash    # Dashboard structure

# Run with Playwright UI
pnpm exec playwright test tests/e2e/grafana-ml.spec.ts --ui

# Debug mode
pnpm exec playwright test tests/e2e/grafana-dashboard.spec.ts --headed --debug

# Generate report
pnpm exec playwright show-report
```

## CI Workflow

`.github/workflows/e2e-ml.yml` runs:
1. **Always**: Backend metrics test
2. **Conditional**: Grafana datasource tests (if secrets set)
3. **Conditional**: Dashboard smoke test (if secrets set)

Artifacts uploaded on failure:
- Playwright HTML report
- Screenshots and videos
- Dashboard JSON attachment
- Backend logs

## Next Steps

1. **Add secrets** to GitHub repo (Settings → Secrets)
2. **Configure datasources** in Grafana
3. **Create/import dashboard** with ML panels
4. **Run tests** locally to verify
5. **Push changes** to trigger CI

For full documentation, see `GRAFANA.md`.
