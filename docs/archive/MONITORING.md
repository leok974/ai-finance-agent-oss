# Monitoring & Metrics

Observability setup for LedgerMind.

---

## Health Endpoints

### `/api/ready`
Lightweight health check (db, migrations, crypto, llm).

### `/api/healthz`
Detailed health status with component breakdown.

---

## Metrics

### Prometheus

**Endpoint:** `/api/metrics`

**Key metrics:**
- `http_requests_total` - Request count by endpoint
- `http_request_duration_seconds` - Request latency
- `edge_csp_policy_length` - CSP policy size
- `help_cache_hits_total` - Help cache performance
- `analytics_events_total` - Event tracking

---

## Grafana Dashboards

See `ops/grafana/` for pre-built dashboards:
- Fallback analytics
- ML suggestions
- CSP metrics

---

## Logging

**Format:** JSON structured logging in production.

**Levels:**
- `DEBUG` - Dev only
- `INFO` - Standard operations
- `WARNING` - Recoverable issues
- `ERROR` - Failures requiring attention

---

## Alerting

Configure Prometheus alerts for:
- High error rate (>5%)
- Slow response time (p95 >1s)
- Crypto/KMS failures
- Database connection issues

---

## Further Reading

- **Operations:** [`RUNBOOKS.md`](RUNBOOKS.md)
- **Troubleshooting:** [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
