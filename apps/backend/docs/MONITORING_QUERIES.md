# ML Suggestions Monitoring Queries

This document provides PromQL queries for monitoring the ML suggestions feature in production.

## Quick Reference

| Metric | Alert Threshold | Dashboard Panel |
|--------|----------------|-----------------|
| Coverage Rate | < 50% | Suggestions Overview |
| Accept Rate | < 10% | User Engagement |
| P95 Latency | > 500ms | Performance |
| Error Rate | > 1% | Reliability |

## Core Metrics

### 1. Suggestions Coverage Rate

**Purpose**: Percentage of uncategorized transactions receiving suggestions

```promql
# Coverage rate (last hour)
100 * (
  sum(rate(suggestions_returned_total[1h]))
  /
  sum(rate(suggestions_requested_total[1h]))
)

# Coverage by source (shadow vs canary vs full)
100 * (
  sum by(source) (rate(suggestions_returned_total{source=~"shadow|canary|model"}[1h]))
  /
  sum by(source) (rate(suggestions_requested_total[1h]))
)
```

**Expected Values**:
- Heuristics: 60-80% (depends on merchant names)
- Shadow mode: Similar to heuristics baseline
- Canary/Full: Target 70%+ coverage

**Alert Condition**:
```promql
100 * (
  sum(rate(suggestions_returned_total[5m]))
  /
  sum(rate(suggestions_requested_total[5m]))
) < 50
```

---

### 2. User Engagement - Accept Rate

**Purpose**: Percentage of suggestions users accept

```promql
# Overall accept rate (last hour)
100 * (
  sum(rate(suggestions_feedback_total{action="accept"}[1h]))
  /
  sum(rate(suggestions_returned_total[1h]))
)

# Accept rate by source
100 * (
  sum by(source) (rate(suggestions_feedback_total{action="accept"}[1h]))
  /
  sum by(source) (rate(suggestions_returned_total[1h]))
)

# Accept rate by category
100 * (
  sum by(category) (rate(suggestions_feedback_total{action="accept"}[1h]))
  /
  sum by(category) (rate(suggestions_returned_total[1h]))
)
```

**Expected Values**:
- Baseline (heuristics): 15-25%
- Canary model: Target 30%+ (20% uplift over baseline)
- Reject rate typically 5-10% (most ignored)

**Alert Condition**:
```promql
# Accept rate drops below 10%
100 * (
  sum(rate(suggestions_feedback_total{action="accept"}[5m]))
  /
  sum(rate(suggestions_returned_total[5m]))
) < 10
```

---

### 3. Latency Percentiles

**Purpose**: Track response time performance

```promql
# P50, P95, P99 latency (seconds)
histogram_quantile(0.50, sum(rate(suggestions_latency_seconds_bucket[1h])) by (le))
histogram_quantile(0.95, sum(rate(suggestions_latency_seconds_bucket[1h])) by (le))
histogram_quantile(0.99, sum(rate(suggestions_latency_seconds_bucket[1h])) by (le))

# Latency by source
histogram_quantile(0.95, sum by(source, le) (rate(suggestions_latency_seconds_bucket[1h])))
```

**Expected Values**:
- P50: < 100ms
- P95: < 300ms
- P99: < 500ms
- Model inference adds ~50-100ms vs heuristics

**Alert Condition**:
```promql
# P95 latency exceeds 500ms
histogram_quantile(0.95, sum(rate(suggestions_latency_seconds_bucket[5m])) by (le)) > 0.5
```

---

### 4. Error Rates

**Purpose**: Track failures in suggestions pipeline

```promql
# Overall error rate (percentage)
100 * (
  sum(rate(suggestions_errors_total[1h]))
  /
  sum(rate(suggestions_requested_total[1h]))
)

# Errors by type
sum by(error_type) (rate(suggestions_errors_total[1h]))

# Model loading failures
rate(model_load_failures_total[1h])
```

**Expected Values**:
- Error rate: < 0.5%
- Model loading: Should be 0 (cached after first load)

**Alert Condition**:
```promql
# Error rate exceeds 1%
100 * (
  sum(rate(suggestions_errors_total[5m]))
  /
  sum(rate(suggestions_requested_total[5m]))
) > 1
```

---

## Rollout Monitoring

### Shadow Mode Validation

**Purpose**: Compare model vs heuristics without user impact

```promql
# Shadow coverage vs heuristics coverage
100 * (
  sum(rate(suggestions_returned_total{source="shadow"}[1h]))
  /
  sum(rate(suggestions_requested_total[1h]))
)

# Expected accept rate (from historical data)
# Cannot measure directly in shadow mode, but track for planning
100 * (
  sum(rate(suggestions_feedback_total{action="accept"}[24h]))
  /
  sum(rate(suggestions_returned_total[24h]))
)
```

**Validation Criteria**:
- Shadow coverage ≥ heuristics coverage
- No performance degradation (latency stable)
- Zero errors from model inference

---

### Canary Rollout

**Purpose**: A/B comparison during gradual rollout

```promql
# Traffic split (canary percentage)
100 * (
  sum(rate(suggestions_returned_total{source="canary"}[1h]))
  /
  (
    sum(rate(suggestions_returned_total{source="canary"}[1h]))
    +
    sum(rate(suggestions_returned_total{source="heuristic"}[1h]))
  )
)

# Canary accept rate vs heuristics accept rate
100 * sum(rate(suggestions_feedback_total{action="accept", source="canary"}[1h]))
    / sum(rate(suggestions_returned_total{source="canary"}[1h]))
vs
100 * sum(rate(suggestions_feedback_total{action="accept", source="heuristic"}[1h]))
    / sum(rate(suggestions_returned_total{source="heuristic"}[1h]))

# Statistical significance check (requires at least 100 samples per group)
sum(rate(suggestions_returned_total{source="canary"}[1h])) * 3600
```

**Go/No-Go Criteria**:
- Canary accept rate ≥ heuristics (no regression)
- Target: 20%+ improvement
- Min sample size: 100 suggestions per group
- Canary latency within 100ms of baseline

---

## Production Health Dashboard

### Top Panel: Overview

```promql
# Requests per minute
sum(rate(suggestions_requested_total[1m])) * 60

# Success rate
100 * (1 - (
  sum(rate(suggestions_errors_total[1m]))
  /
  sum(rate(suggestions_requested_total[1m]))
))

# Active source
max by(source) (suggestions_returned_total)
```

---

### Middle Panel: User Engagement

```promql
# Accept rate (hourly rolling)
100 * (
  sum(rate(suggestions_feedback_total{action="accept"}[1h]))
  /
  sum(rate(suggestions_returned_total[1h]))
)

# Reject rate
100 * (
  sum(rate(suggestions_feedback_total{action="reject"}[1h]))
  /
  sum(rate(suggestions_returned_total[1h]))
)

# Top accepted categories
topk(5, sum by(category) (rate(suggestions_feedback_total{action="accept"}[1h])))
```

---

### Bottom Panel: Performance & Errors

```promql
# Latency distribution
histogram_quantile(0.50, sum(rate(suggestions_latency_seconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(suggestions_latency_seconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(suggestions_latency_seconds_bucket[5m])) by (le))

# Error breakdown
sum by(error_type) (rate(suggestions_errors_total[5m]))

# Model cache hit rate (if exposed)
# (Requires adding model_cache_hits_total and model_cache_misses_total)
100 * (
  sum(rate(model_cache_hits_total[5m]))
  /
  (sum(rate(model_cache_hits_total[5m])) + sum(rate(model_cache_misses_total[5m])))
)
```

---

## Alert Rules (Prometheus Alertmanager)

### Critical Alerts

```yaml
groups:
  - name: ml_suggestions_critical
    interval: 1m
    rules:
      - alert: SuggestionsHighErrorRate
        expr: |
          100 * (
            sum(rate(suggestions_errors_total[5m]))
            /
            sum(rate(suggestions_requested_total[5m]))
          ) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "ML suggestions error rate is {{ $value }}%"
          description: "Error rate exceeds 5% for 5 minutes"

      - alert: SuggestionsHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(suggestions_latency_seconds_bucket[5m])) by (le)
          ) > 1.0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "P95 latency is {{ $value }}s"
          description: "Latency exceeds 1 second for 5 minutes"
```

### Warning Alerts

```yaml
      - alert: SuggestionsLowCoverage
        expr: |
          100 * (
            sum(rate(suggestions_returned_total[10m]))
            /
            sum(rate(suggestions_requested_total[10m]))
          ) < 40
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Suggestions coverage is {{ $value }}%"
          description: "Coverage below 40% for 10 minutes"

      - alert: SuggestionsLowAcceptRate
        expr: |
          100 * (
            sum(rate(suggestions_feedback_total{action="accept"}[1h]))
            /
            sum(rate(suggestions_returned_total[1h]))
          ) < 8
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Accept rate is {{ $value }}%"
          description: "Accept rate below 8% for 1 hour"

      - alert: ModelLoadFailure
        expr: rate(model_load_failures_total[5m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Model failed to load"
          description: "Check model file availability and format"
```

---

## Usage Examples

### Scenario 1: Shadow Mode Validation

1. Enable shadow mode in backend config
2. Monitor for 24 hours:
   ```promql
   # Coverage comparison
   100 * sum(rate(suggestions_returned_total{source="shadow"}[24h])) / sum(rate(suggestions_requested_total[24h]))
   100 * sum(rate(suggestions_returned_total{source="heuristic"}[24h])) / sum(rate(suggestions_requested_total[24h]))

   # Latency impact
   histogram_quantile(0.95, sum by(source, le) (rate(suggestions_latency_seconds_bucket[24h])))
   ```
3. **Go criteria**: Shadow coverage ≥ heuristics, P95 latency < 500ms

---

### Scenario 2: Canary Rollout at 10%

1. Set `ML_MODEL_CANARY=0.10` in backend
2. Wait for statistical significance (100+ samples per group)
3. Compare metrics:
   ```promql
   # Sample size check
   sum(rate(suggestions_returned_total{source="canary"}[1h])) * 3600 >= 100
   sum(rate(suggestions_returned_total{source="heuristic"}[1h])) * 3600 >= 100

   # Accept rate comparison
   100 * sum(rate(suggestions_feedback_total{action="accept", source="canary"}[1h]))
       / sum(rate(suggestions_returned_total{source="canary"}[1h]))
   vs
   100 * sum(rate(suggestions_feedback_total{action="accept", source="heuristic"}[1h]))
       / sum(rate(suggestions_returned_total{source="heuristic"}[1h]))
   ```
4. **Go criteria**: Canary accept rate ≥ heuristics, no latency regression

---

### Scenario 3: Full Rollout Monitoring

1. Set `ML_MODEL_ENABLED=true`, `ML_MODEL_CANARY=1.0`
2. Monitor continuously:
   ```promql
   # Overall health
   rate(suggestions_errors_total[5m])
   histogram_quantile(0.95, sum(rate(suggestions_latency_seconds_bucket[5m])) by (le))

   # User satisfaction
   100 * sum(rate(suggestions_feedback_total{action="accept"}[1h]))
       / sum(rate(suggestions_returned_total[1h]))
   ```
3. **Rollback criteria**: Error rate > 1% OR accept rate drops > 25% relative

---

## Grafana Dashboard JSON

See `ops/grafana/dashboards/ml-suggestions.json` for full dashboard configuration with:
- Real-time overview panel (requests, success rate, latency)
- Engagement metrics (accept/reject rates by source)
- Performance histograms (latency distribution)
- Error breakdown table
- Rollout comparison graphs (canary vs baseline)

---

## Troubleshooting Queries

### High Error Rate Investigation

```promql
# Error types
topk(5, sum by(error_type) (rate(suggestions_errors_total[5m])))

# Affected transactions (requires logging)
# Check backend logs: grep "suggest_auto.*error"
```

### Low Coverage Investigation

```promql
# Coverage by time of day
100 * sum(rate(suggestions_returned_total[1h]))
    / sum(rate(suggestions_requested_total[1h]))

# Check if model is loaded (shadow/canary/model source present)
count(suggestions_returned_total{source=~"shadow|canary|model"}) > 0
```

### Performance Degradation

```promql
# Latency by source
histogram_quantile(0.95, sum by(source, le) (rate(suggestions_latency_seconds_bucket[5m])))

# Model inference time (if exposed separately)
# Add metric: histogram_quantile(0.95, rate(model_inference_seconds_bucket[5m]))
```

---

## Future Enhancements

**Potential Additional Metrics:**

1. **Model Confidence Distribution**:
   ```promql
   histogram_quantile(0.95, rate(suggestions_confidence_bucket[1h]))
   ```

2. **Feature Extraction Time**:
   ```promql
   histogram_quantile(0.95, rate(feature_extraction_seconds_bucket[1h]))
   ```

3. **Cache Hit Rate**:
   ```promql
   100 * sum(rate(model_cache_hits_total[5m]))
       / (sum(rate(model_cache_hits_total[5m])) + sum(rate(model_cache_misses_total[5m])))
   ```

4. **Per-Category Accept Rates**:
   ```promql
   topk(10,
     100 * sum by(category) (rate(suggestions_feedback_total{action="accept"}[1h]))
         / sum by(category) (rate(suggestions_returned_total[1h]))
   )
   ```

---

## References

- Backend metrics instrumentation: `apps/backend/app/services/suggest/serve.py`
- Prometheus configuration: `ops/prometheus.yml`
- Alert rules: `ops/alerts/ml-suggestions.yml`
- Grafana dashboards: `ops/grafana/dashboards/ml-suggestions.json`
- ML training docs: `apps/backend/app/ml/README.md`
