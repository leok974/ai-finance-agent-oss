# Ingest Monitoring Setup

This directory contains Prometheus alerts and Grafana dashboards for monitoring the `/ingest` endpoint health.

## Quick Start

### 1. Start Monitoring Stack

```bash
# Start Prometheus, Grafana, and AlertManager
docker compose -f ops/docker-compose.monitoring.yml up -d

# Verify services are running
docker compose -f ops/docker-compose.monitoring.yml ps
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### 3. Import Ingest Dashboard

1. Open Grafana: http://localhost:3000
2. Navigate to: Dashboards → Import
3. Upload: `ops/grafana/dashboards/ingest-health.json`
4. Select datasource: Prometheus
5. Click "Import"

## Alert Rules

Located in `prometheus/rules/ingest.yml`:

### IngestReplaceErrors (Page)
- **Condition**: Any errors in 5m window
- **Duration**: 2 minutes
- **Action**: Check backend logs immediately

```bash
docker compose -f docker-compose.prod.yml logs backend --tail 100 | grep -i ingest
```

### IngestReplaceErrorsHigh (Critical)
- **Condition**: Error rate > 0.1 req/s
- **Duration**: 1 minute
- **Action**: System degraded, investigate database

```bash
# Check database health
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Verify FK constraints
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U myuser -d finance -c "\d+ suggestion_feedback"
```

### OrphanedFeedbackAccumulating (Info)
- **Condition**: >30% orphaned feedback
- **Duration**: 24 hours
- **Action**: Run cleanup script

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/cleanup_orphaned_feedback.py --days 90
```

## Metrics Exposed

Backend (`/metrics` endpoint):

```promql
# Ingest error counter
lm_ingest_errors_total{phase="replace"}

# Example queries:
rate(lm_ingest_errors_total[5m])          # Error rate
increase(lm_ingest_errors_total[24h])     # Total in 24h
```

## Testing Alerts

### Trigger Test Alert

```bash
# This should trigger IngestReplaceErrors alert after 2 minutes
# (Don't run in production!)
docker compose -f docker-compose.prod.yml exec backend \
  python -c "from app.metrics import ingest_errors; ingest_errors.labels(phase='replace').inc()"
```

### Verify Alert Fired

1. Check Prometheus: http://localhost:9090/alerts
2. Check AlertManager: http://localhost:9093
3. View in Grafana dashboard

## Troubleshooting

### Alert Not Firing

```bash
# Check Prometheus is scraping backend
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.job=="ai-finance-backend")'

# Verify metric exists
curl http://localhost:9090/api/v1/query?query=lm_ingest_errors_total

# Check alert rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="ingest")'
```

### Dashboard Not Showing Data

```bash
# Verify backend metrics endpoint
curl http://localhost:8000/metrics | grep lm_ingest_errors_total

# Check Grafana datasource
# Grafana → Configuration → Data Sources → Prometheus → Test
```

### Hot Reload Prometheus Config

```bash
# After updating rules, reload without restart
docker compose -f ops/docker-compose.monitoring.yml exec prometheus \
  kill -HUP 1

# Or use HTTP API
curl -X POST http://localhost:9090/-/reload
```

## Maintenance

### Backup Grafana Dashboards

```bash
# Export dashboard JSON
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3000/api/dashboards/uid/ingest-health > backup.json
```

### Update Alert Rules

1. Edit `prometheus/rules/ingest.yml`
2. Validate syntax:
   ```bash
   docker run --rm -v $(pwd)/prometheus/rules:/rules \
     prom/prometheus:latest promtool check rules /rules/ingest.yml
   ```
3. Reload Prometheus (see above)

## Integration with External Systems

### Slack Notifications

Edit `ops/alertmanager/alertmanager.yml`:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

### PagerDuty

```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        severity: '{{ .GroupLabels.severity }}'
```

## Related Documentation

- [Ingest Cascade Fix](../../docs/INGEST_CASCADE_FIX.md) - Root cause and solution
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [AlertManager Docs](https://prometheus.io/docs/alerting/latest/alertmanager/)
