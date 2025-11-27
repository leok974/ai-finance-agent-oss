# Database Freshness Exporter

Exports source table freshness metrics to Prometheus Pushgateway for monitoring data staleness.

## Overview

This exporter queries the max timestamp from configured database tables and pushes the results as Prometheus metrics (`dbt_source_loaded_at_seconds`). Grafana dashboards can then visualize how stale each source table is.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐      ┌─────────┐
│  Postgres   │─────→│  Exporter    │─────→│ Pushgateway  │←────→│Prometheus│
│             │ Query│ (this script)│ Push │              │Scrape│         │
│ Tables:     │      │              │      │              │      │         │
│ transactions│      └──────────────┘      └──────────────┘      └─────────┘
│ labels      │                                                        ↓
│ features    │                                                   ┌─────────┐
└─────────────┘                                                   │ Grafana │
                                                                  └─────────┘
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PGHOST` | `postgres` | Postgres hostname |
| `PGPORT` | `5432` | Postgres port |
| `PGUSER` | `myuser` | Database user |
| `PGPASSWORD` | `mypassword` | Database password |
| `PGDATABASE` | `finance` | Database name |
| `PGSCHEMA` | `public` | Default schema |
| `FRESHNESS_TABLES` | `transactions,transaction_labels,ml_features` | Comma-separated table list |
| `FRESHNESS_TIMESTAMP_COL` | `updated_at` | Timestamp column to check |
| `PUSHGATEWAY_URL` | `http://pushgateway:9091` | Pushgateway endpoint |
| `PUSH_JOB_NAME` | `dbt_source_freshness` | Job label for metrics |
| `PUSH_INSTANCE` | `hostname()` | Instance label |
| `PG_TIMEOUT_SECONDS` | `6.0` | Connection timeout |

## Usage

### Option 1: Makefile Target (Recommended)

```bash
# Use default configuration
make freshness-push

# Override configuration
make freshness-push \
  PGHOST=postgres \
  PGUSER=myuser \
  PGPASSWORD=mypassword \
  PGDATABASE=finance \
  PUSHGATEWAY_URL=http://localhost:9091
```

### Option 2: Docker Compose Service

```bash
# Run once
docker compose -f docker-compose.prod.yml run --rm freshness-exporter

# Schedule with cron
*/15 * * * * cd /path/to/repo && make freshness-push >> /var/log/freshness.log 2>&1
```

### Option 3: Direct Python Execution

```bash
# Install dependencies
pip install -r requirements.txt

# Run exporter
export PGHOST=postgres
export PGUSER=myuser
export PGPASSWORD=mypassword
export PGDATABASE=finance
export PUSHGATEWAY_URL=http://localhost:9091

python db_freshness_push.py
```

## Metric Format

The exporter produces metrics in Prometheus exposition format:

```
# TYPE dbt_source_loaded_at_seconds gauge
# HELP dbt_source_loaded_at_seconds Unix timestamp of last data update per source table
dbt_source_loaded_at_seconds{table="transactions",schema="public"} 1730764800
dbt_source_loaded_at_seconds{table="transaction_labels",schema="public"} 1730761200
dbt_source_loaded_at_seconds{table="ml_features",schema="public"} 1730768400
```

## Prometheus Configuration

Add Pushgateway scrape config to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'pushgateway'
    honor_labels: true
    static_configs:
      - targets: ['pushgateway:9091']
```

## Grafana Dashboard Integration

The metric feeds into `ops/grafana/dashboards/ml-source-freshness.json`:

**Query example**:
```promql
# Hours since last update
(time() - max by(table) (dbt_source_loaded_at_seconds{table="transactions"})) / 3600
```

**Panel uses**:
- Stat panels show current freshness
- Timeseries shows staleness trend over 24h
- Color thresholds: 🟢 <48h, 🟡 48-120h, 🔴 >120h

## Troubleshooting

### Exporter fails with connection error

```
[ERROR] Database connection failed: timeout expired
```

**Solution**: Check `PGHOST`, network connectivity, increase `PG_TIMEOUT_SECONDS`

### Pushgateway responds 404

```
[ERROR] Pushgateway responded 404
```

**Solution**: Ensure Pushgateway is running: `docker compose up -d pushgateway`

### Metrics not appearing in Prometheus

1. Check Pushgateway has metrics: `curl http://localhost:9091/metrics`
2. Verify Prometheus scrape config includes Pushgateway
3. Reload Prometheus: `curl -X POST http://localhost:9090/-/reload`

### Table timestamp column differs

If your table uses `created_at` instead of `updated_at`:

```bash
make freshness-push FRESHNESS_TIMESTAMP_COL=created_at
```

Or set permanently in docker-compose.prod.yml service environment.

## Scheduling

### Cron (Host)

```bash
# Every 15 minutes
*/15 * * * * cd /app && make freshness-push >> /var/log/freshness.log 2>&1
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-freshness-exporter
spec:
  schedule: "*/15 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: exporter
            image: python:3.11-slim
            command:
              - bash
              - -c
              - pip install -q -r requirements.txt && python db_freshness_push.py
            env:
              - name: PGHOST
                value: postgres
              # ... other env vars
          restartPolicy: OnFailure
```

### Docker Swarm / Systemd Timer

See examples in `ops/exporters/examples/` (if added later).

## Output Example

```
[INFO] Starting freshness export for 3 table(s)
[INFO] Timestamp column: updated_at
[INFO] Pushgateway: http://pushgateway:9091
[INFO] Checking public.transactions...
[INFO]   Last update: 1730764800 (4.2 hours ago)
[INFO] Checking public.transaction_labels...
[INFO]   Last update: 1730761200 (5.2 hours ago)
[INFO] Checking public.ml_features...
[INFO]   Last update: 1730768400 (3.2 hours ago)
[INFO] Pushing to http://pushgateway:9091/metrics/job/dbt_source_freshness/instance/local...
[OK] Successfully pushed freshness for 3 table(s)
```

## Security Considerations

- **Credentials**: Use environment variables or secrets management (not hardcoded)
- **Network**: Run exporter on same network as Postgres and Pushgateway
- **Timeouts**: Set `PG_TIMEOUT_SECONDS` to prevent hanging connections
- **SQL Injection**: Uses parameterized queries with quoted identifiers

## Related Documentation

- **[ML_OBSERVABILITY_COMPLETE.md](../../ML_OBSERVABILITY_COMPLETE.md)** - Dashboard setup
- **[DATA_QUALITY_COMPLETE.md](../../DATA_QUALITY_COMPLETE.md)** - Freshness SLOs
- **[Prometheus Pushgateway Docs](https://github.com/prometheus/pushgateway)** - Upstream docs
