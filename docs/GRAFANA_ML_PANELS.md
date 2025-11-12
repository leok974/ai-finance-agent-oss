# Grafana ML Pipeline Panels

Quick reference for adding ML Pipeline Phase 2.1 monitoring panels to Grafana.

## Must-Have Panels (Paste-Ready)

### 1. Accept Rate (24h) - Stat

**Description**: Percentage of suggestions accepted by users

**PromQL**:
```promql
sum(increase(lm_ml_suggestion_accepts_total[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings**:
- Unit: Percent (0.0-1.0)
- Thresholds: Red < 0.30, Yellow 0.30-0.50, Green > 0.50

---

### 2. Top Accepts by Model/Label - Table

**Description**: Which model versions and labels are most accepted

**PromQL**:
```promql
sum by (model_version,label) (increase(lm_ml_suggestion_accepts_total[24h]))
```

**Settings**:
- Sort by: Value (descending)
- Limit: 10

---

### 3. Ask-Agent Rate - Stat

**Description**: Percentage of suggestions falling below confidence threshold

**PromQL**:
```promql
sum(increase(lm_ml_predict_requests_total{mode="ask"}[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings**:
- Unit: Percent (0.0-1.0)
- Thresholds: Red > 0.50, Yellow 0.30-0.50, Green < 0.30

---

### 4. Canary Coverage - Stat

**Description**: Percentage of requests served by canary model

**PromQL**:
```promql
sum(increase(lm_ml_predict_requests_total{mode="canary"}[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings**:
- Unit: Percent (0.0-1.0)
- Should match `SUGGEST_USE_MODEL_CANARY` setting

---

## Additional Panels
```promql
sum by (model_version) (increase(lm_ml_suggestion_accepts_total[24h]))
/
sum by (model_version) (increase(lm_ml_predict_requests_total[24h]))
```

**Panel Settings**:
- Orientation: Horizontal
- Unit: Percent (0.0-1.0)
- Show legend: Yes

---

## Panel 4: "Ask Agent" Rate

**Type**: Stat
**Description**: How often confidence gate triggers "ask agent" mode

**PromQL Query**:
```promql
sum(increase(lm_ml_ask_agent_total[24h]))
/
clamp_min(sum(increase(lm_ml_predict_requests_total[24h])), 1) * 100
```

**Panel Settings**:
- Unit: Percent (0-100)
- Decimals: 1
- Thresholds:
  - Green: < 10% (high confidence)
  - Yellow: 10-30% (moderate)
  - Red: > 30% (low confidence, needs training)

---

## Panel 5: Merchant Majority Hits

**Type**: Graph
**Description**: Time series of merchant majority rule hits

**PromQL Query**:
```promql
rate(lm_ml_merchant_majority_hits_total[5m])
```

**Panel Settings**:
- Y-axis: Requests/sec
- Legend: Show
- Draw style: Lines
- Fill opacity: 10%

---

## Panel 6: Suggestion Source Distribution

**Type**: Pie chart
**Description**: Breakdown of suggestion sources (merchant_majority, heuristic, model)

**PromQL Query**:
```promql
sum by (source) (increase(lm_ml_predict_requests_total[24h]))
```

**Panel Settings**:
- Legend: Show values
- Unit: Short

---

## Dashboard Layout Suggestion

```
Row 1 (Key Metrics):
┌──────────────┬──────────────┬──────────────┐
│ Accept Rate  │ Ask Agent %  │ Total Reqs   │
│   (Stat)     │   (Stat)     │   (Stat)     │
└──────────────┴──────────────┴──────────────┘

Row 2 (Performance):
┌───────────────────────┬───────────────────────┐
│  Model Performance    │  Top Labels by Accept │
│  (Bar gauge)          │  (Table)              │
└───────────────────────┴───────────────────────┘

Row 3 (Time Series):
┌───────────────────────────────────────────────┐
│  Merchant Majority Hits Over Time (Graph)     │
└───────────────────────────────────────────────┘

Row 4 (Distribution):
┌───────────────────────────────────────────────┐
│  Suggestion Source Distribution (Pie)         │
└───────────────────────────────────────────────┘
```

---

## Import Dashboard JSON

To create these panels automatically, you can import the JSON template:

```bash
# Generate dashboard JSON
cat > ops/grafana/dashboards/ml-pipeline.json <<'EOF'
{
  "dashboard": {
    "title": "ML Pipeline Phase 2.1",
    "tags": ["ml", "suggestions"],
    "timezone": "utc",
    "panels": [
      {
        "id": 1,
        "title": "Accept Rate (24h)",
        "type": "stat",
        "targets": [{
          "expr": "sum(increase(lm_ml_suggestion_accepts_total[24h])) / clamp_min(sum(increase(lm_ml_predict_requests_total[24h])), 1) * 100"
        }]
      }
    ]
  }
}
EOF
```

Or manually add panels using the queries above.

---

## Alerting Rules

Add these to `ops/prometheus/rules/ml-alerts.yml`:

```yaml
groups:
  - name: ml_pipeline
    interval: 5m
    rules:
      - alert: LowAcceptRate
        expr: |
          sum(increase(lm_ml_suggestion_accepts_total[1h]))
          /
          sum(increase(lm_ml_predict_requests_total[1h])) < 0.30
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "ML accept rate below 30% for 30min"

      - alert: HighAskAgentRate
        expr: |
          sum(increase(lm_ml_ask_agent_total[1h]))
          /
          sum(increase(lm_ml_predict_requests_total[1h])) > 0.40
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Ask agent rate above 40% - model may need retraining"
```

---

## Testing Panels Locally

If prometheus is running locally:

```bash
# Test PromQL query directly
curl -s 'http://localhost:9090/api/v1/query?query=sum(increase(lm_ml_suggestion_accepts_total[24h]))' | jq

# Or use port-forward if in k8s
kubectl port-forward svc/prometheus 9090:9090
```

---

## Next Steps

1. Create dashboard: Grafana UI → Dashboards → New → Import
2. Add panels using queries above
3. Set up alerting rules in Prometheus
4. Configure notification channels (Slack, email)
5. Document baseline accept rate for anomaly detection
