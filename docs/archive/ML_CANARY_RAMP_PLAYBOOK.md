# ML Model Canary Ramp Playbook

**Goal**: Safely roll out ML model predictions alongside merchant-majority rules
**Strategy**: Progressive canary with shadow mode for drift detection
**Timeline**: 0% → 10% → 50% → 100% over 1-2 weeks with validation gates

---

## Prerequisites

✅ Merchant majority rules deployed and stable
✅ Grafana panels configured (accept rate, canary coverage)
✅ `SUGGEST_ENABLE_SHADOW=1` (tracks both rule and model predictions)
✅ Baseline accept rate established (from rules-only period)

---

## Stage 0: Baseline (Rules Only)

**Duration**: 3-7 days
**Configuration**:
```bash
SUGGEST_ENABLE_SHADOW=1
SUGGEST_USE_MODEL_CANARY=0
```

**Actions**:
```bash
make canary-0
make canary-status  # Verify
```

**Validation**:
- [ ] Capture baseline accept rate from Grafana (e.g., 55%)
- [ ] Verify shadow metrics are being logged (both rule and model)
- [ ] Confirm no errors in logs

**Success Criteria**:
- Accept rate stable at baseline
- Shadow predictions logging correctly
- No performance degradation

---

## Stage 1: Canary 10%

**Duration**: 2-3 days
**Configuration**:
```bash
SUGGEST_USE_MODEL_CANARY=10%
```

**Actions**:
```bash
make canary-10
# Monitor Grafana for 48 hours
```

**Validation**:
- [ ] Canary coverage = ~10% (check Grafana: `lm_ml_predict_requests_total{mode="canary"}`)
- [ ] Accept rate ≥ baseline (no degradation)
- [ ] Latency p99 < 500ms (no slowdown)
- [ ] Error rate < 1%

**Rollback Trigger**:
- Accept rate drops >5pp below baseline
- Error rate >2%
- Latency p99 >1000ms

**Rollback**:
```bash
make canary-0
# Investigate: check logs, model calibration, feature drift
```

---

## Stage 2: Canary 50%

**Duration**: 3-5 days
**Configuration**:
```bash
SUGGEST_USE_MODEL_CANARY=50%
```

**Actions**:
```bash
make canary-50
# Monitor for 72 hours minimum
```

**Validation**:
- [ ] Canary coverage = ~50%
- [ ] Accept rate ≥ baseline or showing +2-5pp lift
- [ ] Model predictions outperforming rules in shadow metrics
- [ ] No increase in "ask agent" rate

**Success Criteria**:
- Accept rate stable or improving
- ML model predictions have ≥baseline accept rate
- Confidence distribution healthy (not clustered at threshold)

**Rollback Trigger**:
- Accept rate drops >3pp below baseline
- Ask agent rate increases >10pp
- User complaints about suggestions

---

## Stage 3: Full Rollout (100%)

**Duration**: Permanent (with monitoring)
**Configuration**:
```bash
SUGGEST_USE_MODEL_CANARY=100%
SUGGEST_ENABLE_SHADOW=1  # Keep for ongoing drift detection
```

**Actions**:
```bash
make canary-100
# Monitor for 1 week, then reduce monitoring cadence
```

**Validation**:
- [ ] Accept rate sustains lift (or at least matches baseline)
- [ ] Model version tagged in all suggestion logs
- [ ] Merchant majority still firing for known brands
- [ ] Calibration holds (confidence ~= actual acceptance)

**Ongoing**:
- Weekly review of accept rate by model_version
- Monthly calibration check (isotonic recalibration if drift)
- Quarterly feature drift analysis

---

## Monitoring Queries

### Accept Rate (Overall)
```promql
sum(increase(lm_ml_suggestion_accepts_total[24h]))
/
clamp_min(sum(increase(lm_ml_predict_requests_total[24h])), 1) * 100
```

### Canary Coverage
```promql
sum(increase(lm_ml_predict_requests_total{mode="canary"}[24h]))
/
clamp_min(sum(increase(lm_ml_predict_requests_total[24h])), 1) * 100
```

### Accept Rate by Model
```promql
sum by (model_version) (increase(lm_ml_suggestion_accepts_total[24h]))
/
sum by (model_version) (increase(lm_ml_predict_requests_total[24h]))
```

### Ask Agent Rate
```promql
sum(increase(lm_ml_ask_agent_total[24h]))
/
clamp_min(sum(increase(lm_ml_predict_requests_total[24h])), 1) * 100
```

---

## Rollback Procedures

### Immediate Rollback (Production Incident)
```bash
# Drop to 0% immediately
make canary-0

# Verify
make canary-status

# Check logs for errors
docker compose logs backend --tail=100 | grep ERROR
```

### Gradual Rollback (Non-Critical Issues)
```bash
# Step down gradually
make canary-50  # If at 100%
# Monitor for 6 hours
make canary-10  # If still degraded
# Monitor for 6 hours
make canary-0   # If not improving
```

### Post-Rollback Investigation
1. Check model version: Is it the expected model?
2. Review recent training: Feature distribution drift?
3. Check calibration: Confidence vs actual acceptance
4. Analyze "ask agent" cases: What's causing low confidence?
5. Review merchant majority coverage: Are rules still firing?

---

## Success Metrics Targets

| Metric | Baseline (Rules) | Target (ML) | Status |
|--------|------------------|-------------|---------|
| Accept Rate | 55% | ≥60% | 🎯 +5pp lift |
| Ask Agent Rate | 20% | ≤15% | 🎯 Reduce uncertainty |
| Latency p99 | 200ms | <500ms | ✅ Stay fast |
| Merchant Majority Hits | 30% | 25-35% | ✅ Maintain coverage |

---

## Alerts to Configure

### Critical (PagerDuty)
- Accept rate drops >10pp below baseline for >30min
- Error rate >5% for >15min
- Latency p99 >2000ms for >10min

### Warning (Slack)
- Accept rate drops 5-10pp below baseline for >1h
- Ask agent rate >30% for >2h
- Canary coverage deviates >15pp from target

---

## Timeline Example

**Week 1**: Stage 0 (baseline capture)
**Week 2**: Stage 1 (canary 10%)
**Week 3**: Stage 2 (canary 50%)
**Week 4**: Stage 3 (full rollout 100%)
**Week 5+**: Monitor, optimize, iterate

---

## Post-Rollout Optimization

Once at 100% and stable:

1. **Calibration Tuning**
   - Run isotonic calibration on past month's data
   - Update `SUGGEST_THRESHOLDS_JSON` with per-class thresholds

2. **Feature Engineering**
   - Analyze merchant majority misses
   - Add new features (merchant category hints, recurring patterns)

3. **Model Refresh**
   - Monthly retraining on latest labels
   - A/B test new model versions in canary mode

4. **Golden Eval Set**
   - Curate 200-500 diverse transactions
   - Track F1, precision, recall over time

---

## Contact & Escalation

**Canary Owner**: Backend Team
**Grafana Dashboard**: ML Pipeline Phase 2.1
**Runbook**: This file (`ML_CANARY_RAMP_PLAYBOOK.md`)

For issues:
1. Check Grafana → ML Pipeline dashboard
2. Run `make canary-status` and `make ml-verify-logs`
3. Review `apps/backend/logs/` for errors
4. Rollback if critical: `make canary-0`
5. File incident report with metrics screenshots
