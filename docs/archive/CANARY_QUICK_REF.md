# 10% Canary Deployment - Quick Reference

## ✅ Setup Complete

### Services Running
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093
- **Backend**: http://localhost:8000

### Prometheus Configuration
- ✅ Scraping backend at `host.docker.internal:8000/metrics`
- ✅ Scrape interval: 10s
- ✅ Target status: **UP**

### Grafana Dashboard
- ✅ Dashboard created: `ops/grafana/dashboards/ledgermind/ml-pipeline-phase-2.1.json`
- ✅ Prometheus datasource configured
- ✅ Auto-refresh: 30s

---

## Starting 10% Canary

### Step 1: Stop Current Backend
Find the terminal running backend and press `Ctrl+C`

### Step 2: Set Canary Environment Variable
```powershell
$env:SUGGEST_USE_MODEL_CANARY = "10"
```

### Step 3: Restart Backend
```powershell
cd c:\ai-finance-agent-oss-clean\apps\backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Step 4: Verify Canary Setting
```powershell
Invoke-RestMethod "http://localhost:8000/ml/status"
# Should show: { "canary": "10", ... }
```

---

## Accessing Grafana

1. Open browser: **http://localhost:3000**
2. Login:
   - Username: `admin`
   - Password: `admin`
3. Navigate to dashboard:
   - Click **Home** (top left)
   - Select **LedgerMind** folder
   - Click **ML Pipeline Phase 2.1**

---

## Dashboard Panels

### Panel 1: Accept Rate (24h) - Gauge
- **Query**: `sum(increase(lm_ml_suggestion_accepts_total[24h])) / clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)`
- **Good**: 30-60%
- **Thresholds**: 🔴 <30%, 🟡 30-50%, 🟢 >50%

### Panel 2: Top Accepts by Model/Label - Pie Chart
- **Query**: `topk(10, sum by (model_version, label) (increase(lm_ml_suggestion_accepts_total[24h])))`
- **Shows**: Most accepted suggestion categories

### Panel 3: Ask-Agent Rate - Gauge
- **Query**: `sum(increase(lm_ml_ask_agent_total[24h])) / clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)`
- **Good**: <30%
- **Thresholds**: 🟢 <30%, 🟡 30-50%, 🔴 >50%

### Panel 4: Canary Coverage - Gauge
- **Query**: `sum(increase(lm_ml_predict_requests_total{mode="canary"}[24h])) / clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)`
- **Expected**: ~10% (0.10)
- **Thresholds**: 🟢 9-11%, 🟡 5-9% or 11-15%, 🔴 Outside range

---

## Monitoring Schedule

### First 24 Hours (Check every hour):
- [ ] Accept rate ≥ 30%
- [ ] Ask-agent rate < 50%
- [ ] Canary coverage ~10%
- [ ] No errors in backend logs
- [ ] p99 latency < 500ms

### Days 2-7 (Check daily):
- [ ] Accept rate stable or improving
- [ ] Error rate < 1%
- [ ] No user complaints
- [ ] Latency stable

### Week 2 - Ramp to 50%:
If metrics are stable for 7 days:
```powershell
$env:SUGGEST_USE_MODEL_CANARY = "50"
# Restart backend
```

### Week 3+ - Ramp to 100%:
If 50% canary is stable for 5-7 days:
```powershell
$env:SUGGEST_USE_MODEL_CANARY = "100"
# Restart backend
```

---

## Testing Metrics

### Create Test Suggestion
```powershell
Invoke-RestMethod "http://localhost:8000/ml/suggestions" `
  -Method Post `
  -Body (@{txn_ids=@(2)} | ConvertTo-Json) `
  -ContentType "application/json"
```

### Find Latest Suggestion ID
```powershell
cd apps\backend
python query_suggestions.py
```

### Accept Suggestion (to generate metrics)
```powershell
# Replace {id} with actual suggestion ID
Invoke-RestMethod "http://localhost:8000/ml/suggestions/{id}/accept" -Method Post
```

### Check Metric Increment
```powershell
$metrics = (Invoke-WebRequest "http://localhost:8000/metrics").Content
$metrics | Select-String 'lm_ml_suggestion_accepts_total'
```

---

## Rollback Plan

If any of these occur, **immediately set canary to 0%**:

1. **Accept rate drops > 15%** from baseline
2. **Error rate > 1%**
3. **p99 latency > 1s**
4. **User reports** of incorrect suggestions
5. **Ask-agent rate > 60%**

### Rollback Command
```powershell
# Stop backend (Ctrl+C)
$env:SUGGEST_USE_MODEL_CANARY = "0"
cd apps\backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## Useful Commands

### Check Prometheus Targets
```powershell
Invoke-RestMethod "http://localhost:9090/api/v1/targets" | ConvertTo-Json -Depth 3
```

### Reload Prometheus Config
```powershell
curl -X POST http://localhost:9090/-/reload
```

### Check Container Logs
```powershell
docker logs prometheus -f
docker logs grafana -f
docker logs alertmanager -f
```

### Restart Monitoring Stack
```powershell
cd ops
docker compose -f docker-compose.monitoring.yml restart
```

### Stop Monitoring Stack
```powershell
cd ops
docker compose -f docker-compose.monitoring.yml down
```

---

## Troubleshooting

### Dashboard shows "No data"
1. Check backend is running: `curl http://localhost:8000/health`
2. Check Prometheus scraping: http://localhost:9090/targets
3. Check backend metrics: `curl http://localhost:8000/metrics | Select-String 'lm_ml'`
4. Create test suggestion and accept it to generate metrics

### Canary coverage always 0%
- Model not loaded or `SUGGEST_USE_MODEL_CANARY=0`
- Check backend logs for model loading errors
- Verify ML status: `Invoke-RestMethod "http://localhost:8000/ml/status"`

### High ask-agent rate
- Model confidence threshold may be too high
- Check `SUGGEST_CONFIDENCE_THRESHOLD` setting
- Review model training quality (F1 score)

---

## Success Criteria

**Canary Graduation** (move to next percentage):
- ✅ Accept rate ≥ 30% for 7+ days
- ✅ Ask-agent rate < 50%
- ✅ Error rate < 1%
- ✅ p99 latency < 500ms
- ✅ No user complaints
- ✅ Canary coverage matches setting (±2%)

**Phase 2.1 Complete** (100% canary stable):
- ✅ All metrics stable for 7+ days at 100%
- ✅ User feedback positive
- ✅ No production incidents
- ✅ Dashboard showing expected patterns
