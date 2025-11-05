# Database Freshness Exporter — Quick Setup ✅

Push source table freshness metrics to Prometheus Pushgateway.

## 🚀 Quick Start

### 1. Start Pushgateway
```bash
docker compose -f docker-compose.prod.yml up -d pushgateway
```

### 2. Push Metrics Once
```bash
make freshness-push
```

### 3. Verify in Pushgateway
```bash
curl http://localhost:9091/metrics | grep dbt_source_loaded_at_seconds

# Expected output:
# dbt_source_loaded_at_seconds{table="transactions",schema="public"} 1730764800
# dbt_source_loaded_at_seconds{table="transaction_labels",schema="public"} 1730761200
# dbt_source_loaded_at_seconds{table="ml_features",schema="public"} 1730768400
```

### 4. Update Prometheus Config
Already done! `ops/prometheus.yml` includes:
```yaml
- job_name: 'pushgateway'
  honor_labels: true
  static_configs:
    - targets: ['pushgateway:9091']
```

### 5. Reload Prometheus
```bash
# If using docker compose monitoring stack
docker compose -f ops/docker-compose.monitoring.yml restart prometheus

# Or send reload signal
curl -X POST http://localhost:9090/-/reload
```

### 6. Query in Prometheus
```promql
# Raw timestamp
dbt_source_loaded_at_seconds

# Hours since last update
(time() - dbt_source_loaded_at_seconds) / 3600
```

### 7. View in Grafana Dashboard
```bash
# Import the freshness dashboard
export GRAFANA_URL="https://your-grafana"
export GRAFANA_API_KEY="your-key"
make ml-dash-import-freshness
```

Dashboard URL: `https://your-grafana/d/ml-source-freshness`

## 📅 Schedule (Production)

### Option 1: Cron (Host)
```bash
# Every 15 minutes
*/15 * * * * cd /app && make freshness-push >> /var/log/freshness.log 2>&1
```

### Option 2: Docker Compose Run (Systemd Timer)
```bash
# Create systemd timer
sudo tee /etc/systemd/system/freshness-push.timer <<EOF
[Unit]
Description=DB Freshness Push Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/freshness-push.service <<EOF
[Unit]
Description=DB Freshness Push Service

[Service]
Type=oneshot
WorkingDirectory=/app
ExecStart=/usr/bin/make freshness-push
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now freshness-push.timer
```

### Option 3: K8s CronJob
See `ops/exporters/README.md` for Kubernetes example.

## 🔧 Configuration

Override via environment variables:

```bash
# Custom tables
make freshness-push FRESHNESS_TABLES="users,orders,products"

# Different timestamp column
make freshness-push FRESHNESS_TIMESTAMP_COL=created_at

# Custom Pushgateway URL
make freshness-push PUSHGATEWAY_URL=http://pushgateway:9091

# Production credentials
make freshness-push \
  PGHOST=prod-db.example.com \
  PGUSER=readonly \
  PGPASSWORD=$DB_PASSWORD \
  PGDATABASE=analytics
```

## 🐛 Troubleshooting

### Pushgateway not running
```bash
docker compose -f docker-compose.prod.yml ps pushgateway
docker compose -f docker-compose.prod.yml up -d pushgateway
```

### Connection timeout
```bash
# Check network connectivity
docker run --rm --network shared-ollama python:3.11-slim \
  sh -c "apt update && apt install -y postgresql-client && \
         psql -h postgres -U myuser -d finance -c 'SELECT 1'"

# Increase timeout
make freshness-push PG_TIMEOUT_SECONDS=15
```

### Metrics not in Prometheus
```bash
# 1. Check Pushgateway has metrics
curl http://localhost:9091/metrics | grep dbt_source

# 2. Check Prometheus scrape targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="pushgateway")'

# 3. Query Prometheus directly
curl 'http://localhost:9090/api/v1/query?query=dbt_source_loaded_at_seconds' | jq
```

## 📊 Grafana Queries

Dashboard uses these queries (already configured):

```promql
# Stat panel: transactions freshness (hours)
(time() - max by(table) (dbt_source_loaded_at_seconds{table="transactions"})) / 3600

# Timeseries: all sources trend
(time() - max by(table) (dbt_source_loaded_at_seconds)) / 3600
```

## ✅ Verification

Run comprehensive check:
```bash
# 1. Push metrics
make freshness-push

# 2. Verify in Pushgateway
curl -s http://localhost:9091/metrics | grep dbt_source_loaded_at_seconds

# 3. Verify in Prometheus
sleep 20  # Wait for scrape
curl -s 'http://localhost:9090/api/v1/query?query=dbt_source_loaded_at_seconds' | \
  jq '.data.result[] | {table: .metric.table, timestamp: .value[1]}'

# 4. Check Grafana (manual)
# Open: https://your-grafana/d/ml-source-freshness
```

## 📚 Related Docs

- **[ops/exporters/README.md](../exporters/README.md)** - Full exporter documentation
- **[ML_OBSERVABILITY_COMPLETE.md](../../ML_OBSERVABILITY_COMPLETE.md)** - Dashboard setup
- **[DATA_QUALITY_COMPLETE.md](../../DATA_QUALITY_COMPLETE.md)** - Freshness SLOs

---

**Status**: ✅ Ready  
**Updated**: November 4, 2025
