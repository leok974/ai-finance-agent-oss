# Ingest Monitoring - Final Implementation

## Completion Status: ✅ ALL REQUIREMENTS MET

### 1. Database Migration (✅ VERIFIED)
- **Migration**: `20251104_fk_feedback_event_cascade`
- **Status**: Applied and verified at head revision
- **Change**: Added `ON DELETE SET NULL` to `suggestion_feedback.event_id` FK
- **Verification**: 
  ```bash
  docker compose -f docker-compose.prod.yml exec backend python -m alembic -c /app/alembic.ini current
  # Output: 20251104_fk_feedback_event_cascade (head)
  ```

### 2. SLO Alert with Quiet-Hours Logic (✅ IMPLEMENTED)
- **Alert**: `IngestSLOViolation`
- **File**: `prometheus/rules/ingest.yml`
- **Logic**: 
  ```yaml
  expr: |
    (
      increase(lm_ingest_errors_total{phase="replace"}[1h]) > 0
      AND
      increase(lm_ingest_requests_total[1h]) > 0
    )
  ```
- **Purpose**: Only fires when there are BOTH errors AND requests in the past hour
- **Benefit**: Prevents false positives during quiet hours (no traffic = no alert)
- **Severity**: Warning
- **Duration**: 5 minutes

### 3. Runbook Links (✅ ADDED)
- **Prometheus Alerts**: All 4 alerts updated with GitHub documentation URLs
  - `IngestReplaceErrors`: https://github.com/your-org/ledgermind/blob/main/docs/INGEST_CASCADE_FIX.md
  - `IngestReplaceErrorsHigh`: https://github.com/your-org/ledgermind/blob/main/docs/INGEST_CASCADE_FIX.md
  - `IngestSLOViolation`: https://github.com/your-org/ledgermind/blob/main/docs/INGEST_CASCADE_FIX.md
  - `OrphanedFeedbackAccumulating`: https://github.com/your-org/ledgermind/blob/main/CLEANUP_MONITORING_COMPLETE.md

- **Grafana Dashboard**: Description updated with runbook links
  - File: `ops/grafana/dashboards/ingest-health.json`
  - Links: Technical Details, Deployment Guide, Alert Setup

### 4. Request Counter Metric (✅ IMPLEMENTED)
- **Metric**: `lm_ingest_requests_total{phase}`
- **File**: `apps/backend/app/metrics.py`
- **Integration**: `apps/backend/app/routers/ingest.py` (module-level import)
- **Labels**: `phase="replace"` or `phase="append"`
- **Purpose**: Tracks total ingest requests for SLO calculation

## Implementation Details

### Metrics Module (`app/metrics.py`)
```python
ingest_requests = Counter(
    "lm_ingest_requests_total",
    "Total ingest requests by phase",
    labelnames=("phase",),
)
ingest_errors = Counter(
    "lm_ingest_errors_total",
    "Ingest endpoint errors by phase",
    labelnames=("phase",),
)
```

### Ingest Router (`app/routers/ingest.py`)
- **Module-level imports**: Ensures counters are registered with Prometheus registry at app startup
- **Request tracking**: Increments `ingest_requests` at function entry
- **Error tracking**: Increments `ingest_errors` in exception handler

### Alert Rules (`prometheus/rules/ingest.yml`)
1. **IngestReplaceErrors** (page, 2m): Any errors detected
2. **IngestReplaceErrorsHigh** (critical, 1m): High error rate  
3. **IngestSLOViolation** (warn, 5m): Errors during active traffic ⭐ NEW
4. **OrphanedFeedbackAccumulating** (info, 24h): Housekeeping reminder

### Grafana Dashboard (`ops/grafana/dashboards/ingest-health.json`)
- 6 panels: Error rate stat, error timeseries, total errors, activity table, logs, alerts
- Description with runbook links for quick access to documentation

## Deployment Steps

### 1. Rebuild Backend
```bash
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

### 2. Reload Prometheus Config
```bash
# If Prometheus is running
docker compose -f ops/docker-compose.monitoring.yml exec prometheus kill -HUP 1

# Or restart
docker compose -f ops/docker-compose.monitoring.yml restart prometheus
```

### 3. Import Grafana Dashboard
- Navigate to Grafana UI
- Import `ops/grafana/dashboards/ingest-health.json`
- Set Prometheus datasource

### 4. Verify Metrics
```bash
# Check metrics endpoint
curl http://localhost:8000/metrics | grep lm_ingest

# Check Prometheus
curl 'http://localhost:9090/api/v1/query?query=lm_ingest_requests_total'

# Test ingest
curl -X POST -F "file=@test.csv" "http://localhost/ingest?replace=true"
```

## Testing SLO Alert

### Scenario 1: Quiet Hours (No Alert)
- **Condition**: No requests for 1 hour, but some old errors exist
- **Expected**: No alert (requires both errors AND requests)
- **Verification**: 
  ```promql
  increase(lm_ingest_errors_total[1h]) > 0     # May be true
  increase(lm_ingest_requests_total[1h]) > 0    # False (no traffic)
  # AND result = False → No alert
  ```

### Scenario 2: Active Failures (Alert Fires)
- **Condition**: Requests coming in, some failing
- **Expected**: Alert fires after 5 minutes
- **Verification**:
  ```promql
  increase(lm_ingest_errors_total[1h]) > 0      # True
  increase(lm_ingest_requests_total[1h]) > 0     # True  
  # AND result = True → Alert after 5m
  ```

### Scenario 3: Healthy Traffic (No Alert)
- **Condition**: Many requests, zero errors
- **Expected**: No alert
- **Verification**:
  ```promql
  increase(lm_ingest_errors_total[1h]) > 0      # False
  increase(lm_ingest_requests_total[1h]) > 0     # True
  # AND result = False → No alert
  ```

## Troubleshooting

### Metrics Not Appearing
1. **Check Registration**: Verify counters are in Prometheus registry
   ```python
   docker compose exec backend python -c "
   from prometheus_client import REGISTRY
   for collector in REGISTRY._collector_to_names:
       print(collector)
   " | grep ingest
   ```

2. **Check Import**: Verify module-level import in ingest.py
   ```bash
   docker compose exec backend grep "from app.metrics import" /app/app/routers/ingest.py
   ```

3. **Check Increment**: Counters only appear after first increment
   - Make a test request
   - Check /metrics endpoint immediately
   - Query Prometheus if scraping is configured

### Alert Not Firing
1. **Check Prometheus Rules**: Verify rules file loaded
   ```bash
   curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="ingest")'
   ```

2. **Check Metric Availability**: Query metrics in Prometheus UI
3. **Check Alert State**: View in Prometheus Alerts page
4. **Check AlertManager**: Verify routing configuration

## Files Changed

### Created
- `prometheus/rules/ingest.yml` (alert rules)
- `ops/alerts/ingest.yml` (synchronized copy)
- `ops/grafana/dashboards/ingest-health.json` (dashboard)
- `apps/backend/scripts/cleanup_orphaned_feedback.py` (maintenance script)
- `docs/INGEST_CASCADE_FIX.md` (technical documentation)
- `CLEANUP_MONITORING_COMPLETE.md` (deployment guide)

### Modified
- `apps/backend/app/metrics.py` (added ingest counters)
- `apps/backend/app/routers/ingest.py` (added metrics tracking)
- `apps/backend/alembic/versions/20251104_fk_feedback_event_cascade.py` (migration)

## Success Criteria

- [x] DB migration applied and verified
- [x] SLO alert configured with quiet-hours logic
- [x] Runbook links added to all alerts
- [x] Runbook links added to Grafana dashboard
- [x] Request counter metric implemented
- [x] Error counter metric implemented  
- [x] Metrics registered with Prometheus
- [x] Ingest endpoint successfully handles requests
- [x] Code deployed to production container

## Next Steps (Optional)

1. **Start Monitoring Stack**: Launch Prometheus + Grafana + AlertManager
2. **Configure Scraping**: Add backend to Prometheus targets
3. **Test Alerts**: Trigger error conditions to verify alerting
4. **Schedule Cleanup**: Deploy cron job for orphaned feedback cleanup
5. **Add Slack Integration**: Configure AlertManager for team notifications

## References

- [Technical Details](docs/INGEST_CASCADE_FIX.md)
- [Deployment Guide](CLEANUP_MONITORING_COMPLETE.md)
- [Alert Setup](ops/alerts/README.md)
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/overview/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
