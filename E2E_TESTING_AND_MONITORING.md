# E2E Testing & Monitoring for P2P/Transfers

**Status**: ✅ **COMPLETE**
**Date**: 2025-11-19
**Branch**: feat/chart-readability-improvements

## Overview

This document covers:
1. Playwright E2E test for "Transfers / P2P" chart visibility
2. Prometheus metrics for P2P categorization
3. Grafana dashboard panel for monitoring

## Part 1: Playwright E2E Test ✅

### Test File

**Location**: `apps/web/tests/e2e/charts-transfers-p2p.spec.ts`

**Purpose**: Verify that P2P transactions appear correctly in charts with "Transfers / P2P" label

**Test Strategy**:
- Navigates to production app (uses chromium-prod storage state)
- Scrolls to charts panel
- Verifies "Top Categories" card is visible
- Asserts "Transfers / P2P" text appears in the chart
- Validates that chart has at least one bar rendered

### UI Updates

**File**: `apps/web/src/components/ChartsPanel.tsx`

Added testids for E2E selectors:
- `data-testid="top-categories-card"` - Categories card container
- `data-testid="top-categories-chart"` - Categories chart visualization

### Running the Test

```powershell
# From apps/web directory
cd c:\ai-finance-agent-oss-clean\apps\web

# Set BASE_URL to production
$env:BASE_URL = 'https://app.ledger-mind.org'

# Run the test
pnpm exec playwright test tests/e2e/charts-transfers-p2p.spec.ts --project=chromium-prod --reporter=line

# With headed mode (see browser)
pnpm exec playwright test tests/e2e/charts-transfers-p2p.spec.ts --project=chromium-prod --headed
```

### Prerequisites

1. **Production data with P2P transactions**
   - Must have at least one transaction containing Zelle/Venmo/Cash App/PayPal/Apple Cash
   - Transaction must be in current month or selected month range

2. **Auth state**
   - Test uses `chromium-prod` project which requires `playwright/.auth/user-prod.json`
   - Run auth setup if needed: `pnpm exec playwright test tests/auth.setup.ts`

### Expected Behavior

**When P2P transactions exist**:
- ✅ Charts panel loads successfully
- ✅ Top Categories card displays
- ✅ "Transfers / P2P" label appears in legend/bars
- ✅ At least one bar is rendered in the chart

**When NO P2P transactions exist**:
- Test will fail with: `Transfers / P2P legend should be visible when P2P txns exist`
- This is expected - the test validates P2P functionality when P2P data is present

## Part 2: Prometheus Metrics ✅

### Metric Definition

**Location**: `apps/backend/app/metrics/__init__.py`

**Metric Name**: `ledgermind_transactions_categorized_total`

**Type**: Counter

**Labels**: `category` (string)

**Purpose**: Track total number of transactions categorized by LedgerMind, broken down by category

### Implementation

```python
from prometheus_client import Counter

txn_categorized_total = Counter(
    "ledgermind_transactions_categorized_total",
    "Total number of transactions categorized by LedgerMind",
    labelnames=("category",),
)
```

### Usage in Code

**Location**: `apps/backend/app/routers/admin_maintenance.py`

```python
from app.metrics import txn_categorized_total

# After categorizing transaction
if txn_categorized_total:
    try:
        txn_categorized_total.labels(category="Transfers / P2P").inc()
    except Exception:
        pass  # Metrics optional
```

**Integration Points**:
- ✅ Admin bulk backfill endpoint (`/admin/maintenance/backfill-p2p-transfers`)
- ⏳ TODO: Add to transaction ingest pipeline
- ⏳ TODO: Add to ML categorization service
- ⏳ TODO: Add to manual categorization endpoints

### Metric Output

Once deployed, `/metrics` endpoint will expose:

```prometheus
# HELP ledgermind_transactions_categorized_total Total number of transactions categorized by LedgerMind
# TYPE ledgermind_transactions_categorized_total counter
ledgermind_transactions_categorized_total{category="Transfers / P2P"} 123.0
ledgermind_transactions_categorized_total{category="Dining"} 456.0
ledgermind_transactions_categorized_total{category="Groceries"} 789.0
```

### Testing Metrics

```powershell
# 1. Run backend
cd c:\ai-finance-agent-oss-clean\apps\backend
uvicorn app.main:app --reload

# 2. Trigger backfill to increment metric
$headers = @{ "x-admin-token" = $env:ADMIN_TOKEN }
$body = @{ dry_run = $false; max_rows = 10 } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/admin/maintenance/backfill-p2p-transfers" `
  -Method POST -Body $body -ContentType "application/json" -Headers $headers

# 3. Check metrics endpoint
Invoke-RestMethod -Uri "http://localhost:8000/metrics" | Select-String "ledgermind_transactions_categorized"
```

Expected output:
```
ledgermind_transactions_categorized_total{category="Transfers / P2P"} 10.0
```

## Part 3: Grafana Dashboard Panel ✅

### Panel Configuration

**Location**: `grafana-panel-p2p-volume.json`

**Panel Type**: Stat (single big number)

**Title**: "Transfers / P2P Volume"

**Description**: Number of P2P / Transfers transactions categorized in the current time range

### PromQL Query

```promql
sum(
  increase(
    ledgermind_transactions_categorized_total{category="Transfers / P2P"}[$__range]
  )
)
```

**Explanation**:
- `ledgermind_transactions_categorized_total{category="Transfers / P2P"}` - Filter to P2P category
- `increase(...[$__range])` - Calculate increase over dashboard time range
- `sum(...)` - Sum across all instances (if multiple backends)

### Installation

#### Option 1: Import JSON Panel

1. Open Grafana dashboard
2. Click "Add" → "Import"
3. Paste contents of `grafana-panel-p2p-volume.json`
4. Adjust grid position as needed

#### Option 2: Create Manually

1. Add new panel to dashboard
2. Select "Stat" visualization
3. Enter PromQL query:
   ```promql
   sum(increase(ledgermind_transactions_categorized_total{category="Transfers / P2P"}[$__range]))
   ```
4. Configure options:
   - **Calculation**: Last (not null)
   - **Color mode**: Value
   - **Graph mode**: None
   - **Orientation**: Horizontal
5. Set thresholds (optional):
   - Green: 0-49 transactions
   - Yellow: 50-99 transactions
   - Red: 100+ transactions

### Dashboard Layout

**Suggested Position**:
- Width: 6 grid units (1/4 of 24-unit row)
- Height: 4 grid units
- Position: x=0, y=16 (below existing panels)

**Typical Dashboard Flow**:
```
Row 1: [Total Transactions] [Total Spend] [Active Users] [API Latency]
Row 2: [Transaction Rate] [Error Rate] [Cache Hit Rate] [DB Connections]
Row 3: [Category Breakdown Graph] [Monthly Trends Graph]
Row 4: [Transfers / P2P Volume] [Subscriptions] [Dining] [Groceries] ← New!
```

## Part 4: Grafana Timeseries - Category Breakdown ✅

### Panel Configuration

**Location**: `grafana-panel-category-timeseries.json`

**Panel Type**: Time series (multi-line chart)

**Title**: "Transaction Categorizations by Category"

**Description**: Breakdown of transaction categorizations over time, showing trends for each category including Transfers / P2P

### PromQL Query

```promql
sum by (category) (
  increase(
    ledgermind_transactions_categorized_total[$__range]
  )
)
```

**Explanation**:
- `sum by (category)` - Create one line per category
- `increase(...)` - Count new categorizations over selected time range
- Result: Multiple series (Transfers / P2P, Groceries, Dining, etc.)

### Features

**Visual Highlights**:
- Transfers / P2P line: Light blue, 3px width (emphasized)
- Other categories: Default palette colors, 2px width
- Smooth line interpolation
- 10% fill opacity for area under curve

**Legend Configuration**:
- Display mode: Table (bottom placement)
- Shows: Last value + Sum for each category
- Sortable by clicking column headers

**Tooltip Configuration**:
- Mode: Multi (shows all series at cursor position)
- Sort: Descending (highest values first)

### Installation

#### Option 1: Import JSON Panel

1. Open Grafana dashboard
2. Click "Add" → "Import"
3. Paste contents of `grafana-panel-category-timeseries.json`
4. Adjust grid position as needed

#### Option 2: Create Manually

1. Add new panel to dashboard
2. Select "Time series" visualization
3. Enter PromQL query:
   ```promql
   sum by (category) (increase(ledgermind_transactions_categorized_total[$__range]))
   ```
4. Set legend format: `{{category}}`
5. Configure legend:
   - Display mode: Table
   - Placement: Bottom
   - Show legend: Yes
   - Calculations: Last (not null), Sum
6. Configure tooltip:
   - Mode: Multi
   - Sort: Descending
7. Add override for "Transfers / P2P":
   - Color: Light blue
   - Line width: 3

### Dashboard Layout

**Suggested Position**:
- Width: 12 grid units (1/2 of 24-unit row)
- Height: 9 grid units
- Position: x=0, y=20 (below stat panels)

**Updated Dashboard Flow**:
```
Row 1: [Total Transactions] [Total Spend] [Active Users] [API Latency]
Row 2: [Transaction Rate] [Error Rate] [Cache Hit Rate] [DB Connections]
Row 3: [Category Breakdown Graph] [Monthly Trends Graph]
Row 4: [Transfers / P2P Volume] [Subscriptions] [Dining] [Groceries]
Row 5: [Transaction Categorizations by Category (Timeseries)] ← NEW!
```

## Part 5: Playwright Metrics Smoke Test ✅

### Test File

**Location**: `apps/web/tests/e2e/metrics-smoke.spec.ts`

**Purpose**: Verify Prometheus metrics endpoint exposes categorization metrics

**Test Strategy**:
- Uses `request` fixture (no browser UI = fast, stable)
- Validates `/api/metrics` endpoint returns 200 OK
- Asserts `ledgermind_transactions_categorized_total` metric exists
- Asserts `Transfers / P2P` category series is present

### What It Catches

**Regression Detection**:
1. `/api/metrics` endpoint broken (404/500 errors)
2. Categorization metric disappeared from exports
3. Transfers / P2P category stopped being emitted
4. Prometheus client library issues

### Running the Test

```powershell
# From apps/web directory
cd c:\ai-finance-agent-oss-clean\apps\web

# Set BASE_URL to production
$env:BASE_URL = 'https://app.ledger-mind.org'

# Run the test
pnpm exec playwright test tests/e2e/metrics-smoke.spec.ts --project=chromium-prod --reporter=line

# Run with verbose output
pnpm exec playwright test tests/e2e/metrics-smoke.spec.ts --project=chromium-prod --reporter=list
```

### Prerequisites

1. **Backend deployed with metrics support**
   - `ledgermind_transactions_categorized_total` Counter defined
   - `/api/metrics` endpoint exposed (redirects to `/metrics`)

2. **At least one P2P transaction categorized**
   - Run backfill endpoint: `POST /admin/maintenance/backfill-p2p-transfers?dry_run=false`
   - Or: Upload transactions containing Zelle/Venmo/Cash App keywords

### Expected Behavior

**When metrics are working**:
- ✅ `/api/metrics` returns 200 OK
- ✅ Response body contains `ledgermind_transactions_categorized_total`
- ✅ Response body contains P2P series like:
  ```
  ledgermind_transactions_categorized_total{category="Transfers / P2P"} 123.0
  ```

**When P2P backfill hasn't run**:
- Test will fail with: `metrics should expose at least one Transfers / P2P series; did P2P backfill run?`
- Solution: Run backfill or temporarily comment out the P2P-specific assertion

### Regex Validation

The test uses this regex to validate P2P series:
```typescript
/ledgermind_transactions_categorized_total\{[^}]*category="Transfers \/ P2P"[^}]*\}\s+[0-9.eE+-]+/
```

**Matches**:
- `ledgermind_transactions_categorized_total{category="Transfers / P2P"} 123.0`
- `ledgermind_transactions_categorized_total{category="Transfers / P2P",instance="localhost"} 456.0`

**Escaping**:
- `\/` - Forward slash in "Transfers / P2P" must be escaped in regex
- `\{` `\}` - Braces are literal (not regex groups)
- `[0-9.eE+-]+` - Matches integers, floats, scientific notation

## Integration Checklist

### Backend Metrics
- [x] Define `txn_categorized_total` Counter in `metrics/__init__.py`
- [x] Export metric in `__all__`
- [x] Add to admin backfill endpoint
- [ ] Add to transaction ingest pipeline (when transactions are first categorized)
- [ ] Add to ML categorization service
- [ ] Add to manual category updates
- [ ] Add to bulk re-categorization operations

### E2E Testing
- [x] Create test file `charts-transfers-p2p.spec.ts`
- [x] Create test file `metrics-smoke.spec.ts`
- [x] Add testids to ChartsPanel components
- [ ] Run charts test on staging with P2P sample data
- [ ] Run charts test on production after deployment
- [ ] Run metrics smoke test on staging
- [ ] Run metrics smoke test on production
- [ ] Add both tests to CI/CD pipeline

### Monitoring
- [x] Create Grafana Stat panel JSON (P2P volume)
- [x] Create Grafana Timeseries panel JSON (category breakdown)
- [ ] Import Stat panel to production dashboard
- [ ] Import Timeseries panel to production dashboard
- [ ] Set up alerts (optional):
  - Alert if P2P volume drops to 0 (may indicate categorization regression)
  - Alert if P2P volume spikes >10x average (data quality issue?)
  - Alert if `/api/metrics` endpoint returns non-200 status
- [ ] Add panels to runbook documentation

## Deployment Steps

1. **Deploy Backend Changes**
   ```powershell
   cd c:\ai-finance-agent-oss-clean\apps\backend
   # Metric will be available at /metrics after restart
   ```

2. **Deploy Frontend Changes**
   ```powershell
   cd c:\ai-finance-agent-oss-clean
   .\build-prod-web.ps1
   # Updated testids will be in production
   ```

3. **Run E2E Tests**
   ```powershell
   cd c:\ai-finance-agent-oss-clean\apps\web
   $env:BASE_URL = 'https://app.ledger-mind.org'

   # Test charts P2P visibility
   pnpm exec playwright test tests/e2e/charts-transfers-p2p.spec.ts --project=chromium-prod

   # Test metrics endpoint
   pnpm exec playwright test tests/e2e/metrics-smoke.spec.ts --project=chromium-prod
   ```

4. **Import Grafana Panels**
   - Open Grafana dashboard
   - Import `grafana-panel-p2p-volume.json` (Stat panel)
   - Import `grafana-panel-category-timeseries.json` (Timeseries panel)
   - Adjust grid positions as needed
   - Verify data appears

5. **Trigger Initial Backfill** (to populate metrics)
   ```powershell
   # Preview first
   curl -X POST "https://app.ledger-mind.org/admin/maintenance/backfill-p2p-transfers?dry_run=true" `
     -H "x-admin-token: $env:ADMIN_TOKEN"

   # Execute
   curl -X POST "https://app.ledger-mind.org/admin/maintenance/backfill-p2p-transfers?dry_run=false" `
     -H "x-admin-token: $env:ADMIN_TOKEN"
   ```

6. **Verify Metrics**
   ```powershell
   # Check metrics endpoint
   curl https://app.ledger-mind.org/metrics | Select-String "ledgermind_transactions_categorized"

   # Expected output:
   # ledgermind_transactions_categorized_total{category="Transfers / P2P"} 123.0
   ```

7. **Verify Grafana Panels**
   - Open dashboard in browser
   - Confirm Stat panel shows P2P volume
   - Confirm Timeseries panel shows category breakdown
   - Verify "Transfers / P2P" line appears in timeseries

## Troubleshooting

### E2E Test Fails: "Transfers / P2P not visible"

**Possible causes**:
1. No P2P transactions in current month
   - Solution: Upload sample CSV with Zelle/Venmo transactions
   - Or: Adjust test to use month with known P2P data

2. Chart not rendering
   - Check browser console for errors
   - Verify API returns data: `GET /agent/tools/charts/categories?month=2025-11`

3. Testid selector changed
   - Update test selectors to match current implementation

### Metric Not Appearing in /metrics

**Possible causes**:
1. Prometheus client not installed
   - Check: `prometheus_client` in requirements.txt
   - Install: `pip install prometheus-client`

2. Metric never incremented
   - Run backfill endpoint to trigger first increment
   - Check logs for errors

3. Metric initialization issue
   - Verify `txn_categorized_total` exported in `metrics/__init__.py`
   - Check `prime_metrics()` function

### Grafana Panel Shows "No Data"

**Possible causes**:
1. Metric not scraped yet
   - Wait for Prometheus scrape interval (usually 15-60s)
   - Force refresh in Prometheus: Status → Targets

2. Wrong time range
   - Metric counter starts at 0 on backend restart
   - Use time range that includes recent backend deployment

3. PromQL syntax error
   - Test query in Prometheus UI: `http://prometheus:9090/graph`
   - Verify label name matches: `category="Transfers / P2P"`

## Future Enhancements

### Additional Metrics
- `ledgermind_transactions_by_merchant{merchant="Zelle transfer"}` - Track specific merchants
- `ledgermind_p2p_amount_total` - Track dollar volume (not just count)
- `ledgermind_category_accuracy{category,method}` - Track ML vs rule-based accuracy

### Enhanced E2E Tests
- Test P2P grouping in "Top Merchants" chart
- Verify P2P color matches transfers category (sky-blue #38bdf8)
- Test tooltip shows correct aggregated amount
- Test drill-down to P2P transaction list

### Grafana Enhancements
- Add time-series graph of P2P volume over time ✅ (implemented)
- Add breakdown by P2P provider (Zelle vs Venmo vs Cash App)
- Add P2P $ volume panel (requires new metric)
- Add comparison: P2P vs other categories ✅ (implemented via timeseries)
- Add stacked area chart showing category proportions

---

**Files Changed**: 7
**New Files**: 5
**Tests Added**: 2
**Metrics Added**: 1
**Dashboard Panels**: 2

**Total Implementation Time**: ~30 minutes
**Breaking Changes**: None
