# Canary Ramp Quick-Ops Guide

**For:** ML Pipeline Phase 2.1 Model Rollout
**Audience:** Ops/SRE
**Prerequisites:** Access to `make` commands, Grafana dashboard, PostgreSQL

## TL;DR

```bash
make canary-status      # Check current %
make canary-10         # Ramp to 10%
# Monitor 24-48h
make canary-50         # Ramp to 50%
# Monitor 2-3 days
make canary-100        # Full rollout
```

**Rollback:** `make canary-0`

---

## Detailed Procedure

### Stage 1: Baseline (Current: 0%)

**Duration:** Already complete (7 days in shadow mode)

**Validate:**
```bash
make ml-verify-logs | head -20
# Should see only "rule" and "merchant-majority" sources
```

---

### Stage 2: 10% Canary

**Command:**
```bash
make canary-10
make canary-status  # Verify: SUGGEST_USE_MODEL_CANARY=10
```

**Monitor (24-48h):**
1. **Accept Rate** (target: ≥0.30)
   ```promql
   sum(increase(lm_ml_suggestion_accepts_total[1h]))
   / clamp_max(sum(increase(lm_ml_predict_requests_total[1h])), 1)
   ```

2. **Canary Coverage** (should be ~0.10)
   ```promql
   sum(increase(lm_ml_predict_requests_total{mode="canary"}[1h]))
   / clamp_max(sum(increase(lm_ml_predict_requests_total[1h])), 1)
   ```

3. **Ask-Agent Rate** (target: <0.50)
   ```promql
   sum(increase(lm_ml_predict_requests_total{mode="ask"}[1h]))
   / clamp_max(sum(increase(lm_ml_predict_requests_total[1h])), 1)
   ```

4. **Error Rate** (target: <0.01)
   ```promql
   rate(lm_ml_predict_errors_total[1h])
   / rate(lm_ml_predict_requests_total[1h])
   ```

**Success Criteria:**
- ✅ Accept rate ≥30%
- ✅ Ask-agent rate <50%
- ✅ p99 latency <500ms
- ✅ Error rate <1%

**If metrics look good:** Proceed to Stage 3

**If issues detected:**
```bash
make canary-0  # Rollback immediately
# Investigate logs, check model calibration
```

---

### Stage 3: 50% Canary

**Command:**
```bash
make canary-50
make canary-status  # Verify: SUGGEST_USE_MODEL_CANARY=50
```

**Monitor (2-3 days):**
- Same metrics as Stage 2
- Check merchant coverage:
  ```sql
  select source, count(*)
  from suggestions
  where timestamp > now() - interval '24 hours'
  group by source;
  ```

**Validate Model Performance:**
```sql
-- Top labels by canary model
select label, count(*) as accepts
from suggestions
where source = 'model' and mode = 'canary' and accepted = true
and timestamp > now() - interval '24 hours'
group by label
order by accepts desc
limit 10;
```

**Success Criteria:**
- ✅ Accept rate ≥35% (improved from 10% stage)
- ✅ Ask-agent rate <40%
- ✅ No regression in merchant-majority performance
- ✅ User feedback positive (check support tickets)

**If metrics look good:** Proceed to Stage 4

---

### Stage 4: 100% Rollout

**Command:**
```bash
make canary-100
make canary-status  # Verify: SUGGEST_USE_MODEL_CANARY=100
```

**Monitor (ongoing):**
- Set up Grafana alerts (see `docs/GRAFANA_ML_PANELS.md`)
- Weekly review of:
  - Accept rate trend
  - Top labels distribution
  - Ask-agent rate trend

**Celebration Checklist:**
- [ ] Update README with "ML Pipeline Phase 2.1: LIVE 🚀"
- [ ] Post to team chat
- [ ] Document lessons learned
- [ ] Schedule retrospective

---

## Rollback Procedures

### Emergency Rollback (< 5 minutes)
```bash
make canary-0
# Verify immediately:
make canary-status
make ml-verify-logs | grep "canary" | wc -l  # Should be 0
```

### Gradual Rollback
```bash
# If at 100%, step back to 50%
make canary-50
# Monitor 24h, then:
make canary-10
# Monitor 24h, then:
make canary-0
```

---

## Troubleshooting

### Issue: Canary coverage not matching setting
```bash
# Check environment variable is set
docker compose exec backend env | grep SUGGEST_USE_MODEL_CANARY

# Restart backend to pick up new value
docker compose restart backend
```

### Issue: Accept rate drops after ramp
1. Check ask-agent rate (confidence too aggressive?)
2. Review recent suggestions:
   ```bash
   make ml-verify-logs | head -50
   ```
3. Check model calibration:
   ```sql
   select
     round(confidence::numeric, 1) as conf_bucket,
     count(*) as total,
     sum(case when accepted then 1 else 0 end) as accepts
   from suggestions
   where source = 'model' and mode = 'canary'
   and timestamp > now() - interval '24 hours'
   group by 1
   order by 1;
   ```

### Issue: High ask-agent rate
- **Symptom:** >50% of suggestions going to "ask"
- **Cause:** Confidence threshold too high (0.50)
- **Fix:** Temporarily lower to 0.40 via `ML_CONFIDENCE_THRESHOLD` env var
- **Long-term:** Retrain model or improve calibration

---

## Monitoring Checklist (Daily During Ramp)

Morning:
- [ ] Check Grafana dashboard
- [ ] Review accept rate (should be stable or increasing)
- [ ] Check error logs: `docker compose logs backend | grep ERROR | tail -20`

Afternoon:
- [ ] Spot-check suggestions: `make ml-verify-logs | head -10`
- [ ] Verify canary coverage matches setting

Evening:
- [ ] Compare metrics to previous day
- [ ] Update stakeholders if thresholds crossed

---

## Success Metrics (Target @ 100%)

- **Accept Rate:** ≥40%
- **Ask-Agent Rate:** ≤30%
- **Merchant Coverage:** ≥60% of transactions get merchant-majority rule
- **Canary Latency:** p99 <300ms
- **Error Rate:** <0.5%

---

## Contact

**Escalation:** Check `#ml-pipeline` Slack channel
**Runbook:** `docs/ML_CANARY_RAMP_PLAYBOOK.md` (full version)
**On-call:** Page @ml-ops-team for production incidents
