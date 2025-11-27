# 🎯 ML Observability & Lineage — Quick Start

Complete ML infrastructure with dbt lineage, Grafana dashboards, and Prometheus alerting.

## ✅ What's Included

### A) dbt Exposure (ML Training Lineage)
- **File**: `warehouse/models/exposures.yml`
- **Purpose**: Documents ML training pipeline dependencies in dbt
- **Lineage**: Shows `fct_training_view`, `dim_merchants`, `fct_suggestions_eval` → ML app

### B) Grafana Dashboard (Source Freshness)
- **File**: `ops/grafana/dashboards/ml-source-freshness.json`
- **Panels**: 4 (3 stat + 1 timeseries)
- **Metrics**: Hours since last data update for transactions, labels, features
- **Thresholds**: 🟢 <48h, 🟡 48-120h, 🔴 >120h

### C) Prometheus Alerts (Freshness SLOs)
- **File**: `prometheus/rules/dbt_freshness.yml`
- **Rules**: 4 alerts (3 per-source warnings + 1 critical catchall)
- **Thresholds**: Warn @ 2 days, Critical @ 5 days
- **Runbook**: Links to `DATA_QUALITY_COMPLETE.md`

## 🚀 Quick Commands

### Verify dbt Exposure
```bash
cd warehouse
docker run --rm -t --network shared-ollama \
  -v ${PWD}:/work -w /work ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  parse --profiles-dir . --project-dir .
```

### Generate dbt Docs with Lineage
```bash
cd warehouse
docker run --rm -t --network shared-ollama \
  -v ${PWD}:/work -w /work ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  docs generate --profiles-dir . --project-dir .

# Serve at http://localhost:8080
docker run --rm -p 8080:8080 -t \
  -v ${PWD}:/work -w /work ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  docs serve --profiles-dir . --project-dir . --port 8080
```

### Import Freshness Dashboard
```bash
export GRAFANA_URL="https://your-grafana"
export GRAFANA_API_KEY="your-key"
make ml-dash-import-freshness
```

### Check Source Freshness
```bash
cd warehouse
make dbt-freshness
```

## 📊 Metrics Setup

The freshness dashboard expects `dbt_source_loaded_at_seconds` metric. Choose one:

### Option A: dbt-exporter (Recommended)
Schedule job to run `dbt source freshness` and push to Prometheus Pushgateway.

### Option B: Direct Postgres Query
Export `table_loaded_at_seconds{table="..."}` via Postgres exporter.

### Option C: Application-Level
Emit metric when building features in `app/ml/feature_build.py`.

**See**: `ML_OBSERVABILITY_COMPLETE.md` for detailed instructions.

## ✅ Verification

```bash
# Run comprehensive verification
pwsh scripts/verify-ml-infrastructure.ps1

# Expected: 100% pass rate
# ✅ 58 checks (files, configs, dashboards, docs)
```

## 📚 Documentation

| Document | Purpose | Lines |
|----------|---------|-------|
| **[ML_OBSERVABILITY_COMPLETE.md](./ML_OBSERVABILITY_COMPLETE.md)** | Complete guide | 500 |
| **[DATA_QUALITY_COMPLETE.md](./DATA_QUALITY_COMPLETE.md)** | Freshness + leakage | 400 |
| **[ML_SUMMARY.md](./ML_SUMMARY.md)** | Full infrastructure summary | 500 |

## 🎓 Next Steps

1. **Set up metric exporter** (choose Option A/B/C above)
2. **Import freshness dashboard** to Grafana
3. **Reload Prometheus rules** to activate alerts
4. **Generate dbt docs** to explore lineage
5. **Configure AlertManager** to route freshness alerts

---

**Status**: ✅ Complete (awaiting metrics for full visualization)
**Last Updated**: November 4, 2025
