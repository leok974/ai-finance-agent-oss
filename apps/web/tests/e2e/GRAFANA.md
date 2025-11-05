# Grafana ML E2E Tests

End-to-end tests for validating ML metrics in Prometheus and Grafana datasource integration.

## Overview

These tests verify:
1. **Backend metrics emission** - `/metrics` endpoint contains ML-specific counters
2. **Grafana JSON API datasource** - Proxy queries to backend model status
3. **Grafana Prometheus datasource** - Query ML metrics via Grafana proxy
4. **Dashboard structure** - ML Suggestions dashboard exists with expected panels

## Test Files

- **`grafana-ml.spec.ts`** - Grafana datasource E2E tests
  - Warm traffic generation (predict calls, suggestions)
  - Metrics verification (`lm_ml_*`, `lm_suggest_compare_*`)
  - Grafana JSON API datasource proxy (optional)
  - Grafana Prometheus query (optional)

- **`grafana-dashboard.spec.ts`** - Dashboard smoke tests
  - Dashboard search and optional import
  - Panel structure validation
  - Metric query presence checks (`lm_ml_train_val_f1_macro`, etc.)
  - Datasource variable validation

## Prerequisites

### Required (All Tests)

1. **Backend services running**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres backend
   ```

2. **Backend accessible at BASE_URL**:
   ```bash
   curl -f http://localhost:8000/ready
   ```

### Optional (Grafana Tests Only)

3. **Grafana instance** with:
   - Public/accessible URL (e.g., `https://grafana.example.com`)
   - Service account or API token with `Viewer` + API access
   
4. **Grafana datasources configured**:
   - **JSON API** datasource (`simpod-json-datasource`) pointing to backend
   - **Prometheus** datasource pointing to Prometheus with ML metrics

5. **Environment variables set**:
   ```bash
   export GRAFANA_URL=https://grafana.example.com
   export GRAFANA_API_KEY=eyJrIjoi...  # Your Grafana API token
   export GRAFANA_JSON_DS_NAME="ApplyLens API"  # Optional: specific datasource name
   export GRAFANA_PROM_DS_NAME="Prometheus"     # Optional: specific datasource name
   ```

## Running Tests

### Local (Backend Only)

**Run backend metrics tests** (no Grafana required):
```bash
cd apps/web
BASE_URL=http://localhost:8000 pnpm test:e2e:grafana
```

**Expected output**:
- ✅ Warm traffic test passes
- ⏭️ Grafana tests skipped (no credentials)

### Local (With Grafana)

**Run full suite** (including Grafana datasource checks):
```bash
cd apps/web
export BASE_URL=http://localhost:8000
export GRAFANA_URL=https://your-grafana.example.com
export GRAFANA_API_KEY=eyJrIjoi...
pnpm test:e2e:grafana
```

**Run dashboard smoke test**:
```bash
cd apps/web
export GRAFANA_URL=https://your-grafana.example.com
export GRAFANA_API_KEY=eyJrIjoi...
export GRAFANA_DASH_TITLE="LedgerMind — ML Suggestions"  # Optional, default value
pnpm test:e2e:grafana:dash
```

**Run with auto-import** (if dashboard missing):
```bash
export GRAFANA_IMPORT_IF_MISSING=1
export GRAFANA_DASH_JSON_PATH=ops/grafana/ml_suggestions_dashboard.json
pnpm test:e2e:grafana:dash
```

**Expected output**:
- ✅ Warm traffic test passes
- ✅ JSON API datasource proxy passes
- ✅ Prometheus query passes

### CI Execution

**GitHub Actions** (`.github/workflows/e2e-ml.yml`):
- Backend metrics test runs **always**
- Grafana tests run **only if** secrets are configured:
  - `GRAFANA_URL`
  - `GRAFANA_API_KEY`
  - Optional: `GRAFANA_JSON_DS_NAME`, `GRAFANA_PROM_DS_NAME`

**To enable Grafana tests in CI**:
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add repository secrets:
   - `GRAFANA_URL`: `https://grafana.example.com`
   - `GRAFANA_API_KEY`: Your Grafana service account token
   - `GRAFANA_JSON_DS_NAME`: (optional) `"ApplyLens API"`
   - `GRAFANA_PROM_DS_NAME`: (optional) `"Prometheus"`

## Test Scenarios

### 1. Warm Traffic & Metrics

```typescript
test('Warm traffic → verify backend /metrics has lm_ml_*', async () => {
  // 1. Health check /ready
  // 2. Call /ml/v2/predict 3 times
  // 3. Call /agent/suggestions once (triggers compare metric)
  // 4. Verify /metrics contains ML counters
});
```

**Metrics validated**:
- `lm_ml_predict_requests_total` - Prediction request counter
- `lm_ml_*` - All ML-related metrics
- `lm_suggest_compare_total` - Shadow mode comparison counter

**Expected outcomes**:
- `/ready` returns 200
- All predict calls succeed (even if model unavailable)
- Suggestions call may fail (auth-guarded) - that's ok
- `/metrics` contains expected metric names (counts may be zero)

### 2. Grafana JSON API Datasource

```typescript
test('Grafana JSON API proxy to /ml/model/status (optional)', async () => {
  // 1. List Grafana datasources
  // 2. Find simpod-json-datasource (or by name)
  // 3. Query /ml/model/status via Grafana proxy
  // 4. Validate response structure
});
```

**Requirements**:
- `GRAFANA_URL` and `GRAFANA_API_KEY` set
- At least one `simpod-json-datasource` configured in Grafana

**Expected outcomes**:
- Datasource list includes JSON API datasource
- Proxy query succeeds: `/api/datasources/proxy/{id}/ml/model/status`
- Response has `available` and `meta` properties

**Skips gracefully if**:
- Grafana credentials not provided
- No JSON API datasource found

### 3. Grafana Prometheus Query

```typescript
test('Grafana Prometheus query for lm_ml_* (optional)', async () => {
  // 1. List Grafana datasources
  // 2. Find Prometheus datasource
  // 3. Query lm_ml_predict_requests_total via Grafana proxy
  // 4. Validate Prometheus API response
});
```

**Requirements**:
- `GRAFANA_URL` and `GRAFANA_API_KEY` set
- At least one `prometheus` datasource configured in Grafana
- Prometheus scraping backend `/metrics` endpoint

**Expected outcomes**:
- Datasource list includes Prometheus datasource
- Proxy query succeeds: `/api/datasources/proxy/{id}/api/v1/query?query=...`
- Response has `status: "success"` or `status: "error"`
- No assertion on series existence (fresh envs may have no data)

**Skips gracefully if**:
- Grafana credentials not provided
- No Prometheus datasource found

### 4. Dashboard Structure Validation

```typescript
test('Dashboard exists (or import) and has expected ML panels', async () => {
  // 1. Search for dashboard by title
  // 2. Optionally import if missing (requires JSON file)
  // 3. Fetch dashboard by UID
  // 4. Validate structure (panels array, templating variables)
  // 5. Check for expected metrics in panel queries
});
```

**Requirements**:
- `GRAFANA_URL` and `GRAFANA_API_KEY` set
- Dashboard exists in Grafana (or auto-import enabled)

**Expected outcomes**:
- Dashboard search succeeds
- Dashboard has expected title
- Panels array exists with ML metrics:
  - `lm_ml_train_val_f1_macro` (model quality)
  - `lm_ml_predict_requests_total` (prediction traffic)
  - `lm_suggest_compare_total` (shadow mode comparison)
- Templating includes `$prom` datasource variable

**Optional: Auto-import**:
- Set `GRAFANA_IMPORT_IF_MISSING=1`
- Provide `GRAFANA_DASH_JSON_PATH` (relative to repo root)
- Test will POST dashboard JSON to Grafana if not found

**Skips gracefully if**:
- Grafana credentials not provided
- Dashboard not found and import not enabled
- Dashboard JSON file not found (when import enabled)

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes | `http://localhost:8000` | Backend API base URL |
| `GRAFANA_URL` | No | - | Grafana instance URL (enables Grafana tests) |
| `GRAFANA_API_KEY` | No | - | Grafana service account token |
| `GRAFANA_JSON_DS_NAME` | No | First found | Specific JSON API datasource name |
| `GRAFANA_PROM_DS_NAME` | No | First found | Specific Prometheus datasource name |
| `TXN_ID` | No | `999001` | Transaction ID for suggestions test |
| `GRAFANA_DASH_TITLE` | No | `LedgerMind — ML Suggestions` | Dashboard title to search for |
| `GRAFANA_IMPORT_IF_MISSING` | No | `0` | Auto-import dashboard if not found (1=yes) |
| `GRAFANA_DASH_JSON_PATH` | No | `ops/grafana/ml_suggestions_dashboard.json` | Path to dashboard JSON for import |

### Grafana API Token Requirements

**Minimum permissions**:
- **Viewer** role (read dashboards, datasources)
- **API access** enabled

**Creating a service account token**:
1. Grafana → Administration → Service accounts
2. Create new service account: "E2E Tests"
3. Add role: **Viewer**
4. Generate token → Copy token value
5. Use as `GRAFANA_API_KEY`

### Datasource Configuration

#### JSON API Datasource

**Plugin**: `simpod-json-datasource`
**Install**: Grafana → Plugins → JSON API → Install

**Configuration**:
- **URL**: `http://your-backend:8000` (or via reverse proxy)
- **Access**: Server (default) or Browser (if CORS configured)
- **Auth**: None (or Bearer token if backend requires)

**Test query**:
```
GET /ml/model/status
```

#### Prometheus Datasource

**Built-in**: No plugin required

**Configuration**:
- **URL**: `http://prometheus:9090`
- **Access**: Server (default)
- **Scrape job** must include backend `/metrics`:
  ```yaml
  scrape_configs:
    - job_name: 'backend'
      static_configs:
        - targets: ['backend:8000']
  ```

**Test query**:
```promql
lm_ml_predict_requests_total
```

## Troubleshooting

### Dashboard Not Found

**Symptoms**:
```
Dashboard "LedgerMind — ML Suggestions" not found and no import performed
```

**Solutions**:
1. **Check dashboard exists**:
   - Grafana → Dashboards → Search for title
   - Verify exact title match (case-sensitive)

2. **Update search query**:
   ```bash
   export GRAFANA_DASH_TITLE="Your Actual Dashboard Title"
   ```

3. **Enable auto-import**:
   ```bash
   export GRAFANA_IMPORT_IF_MISSING=1
   export GRAFANA_DASH_JSON_PATH=ops/grafana/your-dashboard.json
   pnpm test:e2e:grafana:dash
   ```

4. **Manually import**:
   - Grafana → Dashboards → Import
   - Upload JSON file
   - Re-run test

### Dashboard Import Fails

**Symptoms**:
```
Import failed: 412 Dashboard with the same UID already exists
```

**Solutions**:
1. **Dashboard already exists** - Search with different title or check UID conflicts

2. **Insufficient permissions**:
   - Token needs **Editor** role (not just Viewer) to import
   - Regenerate token with correct permissions

3. **Invalid JSON**:
   - Validate JSON syntax
   - Ensure datasource UIDs exist in target Grafana

### Metrics Not Found

**Symptoms**:
```
Expected metrics to contain 'lm_ml_predict_requests_total'
```

**Causes & Solutions**:
1. **Backend not instrumented**: Verify `/metrics` endpoint exists
   ```bash
   curl http://localhost:8000/metrics | grep lm_ml_
   ```

2. **No traffic generated**: Tests warm up by calling endpoints first
   - Ensure `/ml/v2/predict` is accessible
   - Check backend logs for errors

3. **Metrics prefix mismatch**: If you changed metric names, update test assertions

### Grafana Datasource Not Found

**Symptoms**:
```
No simpod-json-datasource found
```

**Solutions**:
1. **Install plugin**:
   - Grafana → Plugins → Search "JSON API"
   - Install `simpod-json-datasource`

2. **Configure datasource**:
   - Grafana → Connections → Data sources → Add data source
   - Select "JSON API"
   - URL: `http://backend:8000`
   - Save & test

3. **Specify by name**:
   ```bash
   export GRAFANA_JSON_DS_NAME="My Backend API"
   ```

### Grafana Proxy 403 Forbidden

**Symptoms**:
```
Proxy to JSON API datasource failed: 403
```

**Causes & Solutions**:
1. **Insufficient API token permissions**:
   - Token needs **Viewer** role minimum
   - Regenerate token with correct role

2. **Datasource access restrictions**:
   - Check datasource permissions in Grafana
   - Ensure service account can access datasource

3. **CORS issues** (if using Browser access):
   - Switch datasource to **Server** access mode
   - Or configure backend CORS headers

### Prometheus Query Returns Empty

**Expected behavior**: Test does **NOT fail** if series is empty.

**Why?**:
- Fresh environments may have no metrics scraped yet
- Test only validates API health, not data presence

**To populate metrics**:
1. **Generate traffic**:
   ```bash
   for i in {1..10}; do
     curl -X POST http://localhost:8000/ml/v2/predict \
       -H 'Content-Type: application/json' \
       -d '{"merchant": "TEST"}'
   done
   ```

2. **Wait for Prometheus scrape interval** (default 15s-1m)

3. **Query again**:
   ```bash
   curl -G http://prometheus:9090/api/v1/query \
     --data-urlencode 'query=lm_ml_predict_requests_total'
   ```

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/e2e-ml.yml`

**Job environment**:
```yaml
env:
  GRAFANA_URL: ${{ secrets.GRAFANA_URL }}
  GRAFANA_API_KEY: ${{ secrets.GRAFANA_API_KEY }}
```

**Grafana test step** (conditional):
```yaml
- name: Run E2E Grafana tests (optional)
  if: ${{ env.GRAFANA_URL != '' && env.GRAFANA_API_KEY != '' }}
  env:
    BASE_URL: http://localhost:8000
    GRAFANA_URL: ${{ secrets.GRAFANA_URL }}
    GRAFANA_API_KEY: ${{ secrets.GRAFANA_API_KEY }}
    GRAFANA_JSON_DS_NAME: ${{ secrets.GRAFANA_JSON_DS_NAME }}
    GRAFANA_PROM_DS_NAME: ${{ secrets.GRAFANA_PROM_DS_NAME }}
  run: pnpm test:e2e:grafana
```

**Behavior**:
- Backend metrics test **always runs**
- Grafana tests **only run** if secrets configured
- No CI failure if Grafana not configured (graceful skip)

### Security Best Practices

1. **Use service accounts** (not personal API keys)
2. **Rotate tokens regularly** (90 days recommended)
3. **Minimum permissions** (Viewer only, no Admin)
4. **Separate tokens** for dev/staging/prod
5. **Never commit tokens** to repository

## Local Development Workflow

```bash
# 1. Start services
docker compose -f docker-compose.prod.yml up -d postgres backend prometheus

# 2. Wait for ready
curl -f http://localhost:8000/ready

# 3. Run backend-only tests (no Grafana)
cd apps/web
BASE_URL=http://localhost:8000 pnpm test:e2e:grafana

# 4. (Optional) Run with Grafana
export GRAFANA_URL=https://grafana.example.com
export GRAFANA_API_KEY=your_token
pnpm test:e2e:grafana

# 5. Debug specific test
pnpm exec playwright test tests/e2e/grafana-ml.spec.ts --grep "Warm traffic" --headed
```

## Metrics Reference

### ML Model Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `lm_ml_predict_requests_total` | Counter | Total prediction requests |
| `lm_ml_predict_available_total` | Counter | Predictions with model available |
| `lm_ml_predict_unavailable_total` | Counter | Predictions with model unavailable |
| `lm_ml_model_load_total` | Counter | Model load attempts |
| `lm_ml_model_load_errors_total` | Counter | Model load failures |

### Shadow Mode Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `lm_suggest_compare_total{agree="true"}` | Counter | Rule-model agreement |
| `lm_suggest_compare_total{agree="false"}` | Counter | Rule-model disagreement |
| `lm_suggest_rule_only_total` | Counter | Rule-only suggestions (no model) |
| `lm_suggest_model_only_total` | Counter | Model-only suggestions (no rule) |

## Future Enhancements

- [ ] Add dashboard JSON validation tests
- [ ] Test Grafana alert rules for ML metrics
- [ ] Verify panel query syntax (PromQL, JSON API)
- [ ] Test variable substitution in dashboards
- [ ] Add snapshot/approval tests for dashboard structure
- [ ] Test Grafana alerting webhooks

## Related Documentation

- **Backend Metrics**: `apps/backend/app/metrics/README.md`
- **ML E2E Tests**: `apps/web/tests/e2e/README.md`
- **Shadow Mode**: `apps/backend/docs/ml-shadow-mode.md`
- **Prometheus Setup**: `ops/prometheus.yml`
- **Grafana Dashboards**: `ops/grafana/dashboards/`
