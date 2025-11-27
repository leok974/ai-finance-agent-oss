# Ops Directory - KMS Monitoring & Alerting

This directory contains operational configuration files for KMS crypto monitoring and alerting.

## 📁 Directory Structure

```
ops/
├── alertmanager/
│   └── kms.yml                    # AlertManager routing for KMS alerts
├── alerts/
│   ├── edge.yml                   # Edge probe alerts (existing)
│   └── kms.yml                    # KMS monitoring rules
└── grafana/
    └── dashboards/
        └── kms-health.json        # KMS Health dashboard
```

## 🚨 AlertManager Configuration

**File**: `alertmanager/kms.yml`

Contains routing rules and receivers for KMS security alerts:

- **Routes**: Regex-based routing for `^KMS.*` alerts
- **Receivers**:
  - `kms-security` (Slack + email for standard alerts)
  - `kms-critical` (Slack + email + PagerDuty for critical)
- **Inhibit Rules**: Suppress redundant alerts

**Integration**: Merge with your main `alertmanager.yml` configuration

## 📊 Monitoring Rules

**File**: `alerts/kms.yml`

Prometheus monitoring rules including:

- **Alert Rules**: Health checks, error detection, latency monitoring
- **Recording Rules**: Dashboard metrics (`kms:*` prefix)
- **Grace Periods**: Smart thresholds to avoid startup noise

**Used By**: Prometheus (loaded via `rule_files` config)

## 📈 Grafana Dashboard

**File**: `grafana/dashboards/kms-health.json`

Complete dashboard for KMS health monitoring:

- **Variables**: env (environment), service (job name)
- **Panels**: 8 visualization panels including LED health, error rates, service table
- **Alerts**: Integrated alert list
- **Links**: Quick access to health endpoint and runbooks

**Import**: Via Grafana UI or API (see `docs/KMS_SETUP_CHECKLIST.md`)

## 🚀 Quick Setup

### 1. Load Prometheus Rules

```bash
# Validate syntax
docker exec prometheus promtool check rules /path/to/ops/alerts/kms.yml

# Reload Prometheus
docker exec prometheus kill -HUP 1
```

### 2. Configure AlertManager

```bash
# Merge with your main config
# See: docs/KMS_SETUP_CHECKLIST.md#2-alertmanager-routing-configuration

# Reload AlertManager
docker exec alertmanager kill -HUP 1
```

### 3. Import Grafana Dashboard

```bash
# Via API
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  -d @ops/grafana/dashboards/kms-health.json

# Or via UI: Dashboards → Import → Upload JSON
```

## 📖 Documentation

- **Setup Guide**: `docs/KMS_SETUP_CHECKLIST.md`
- **Operations Manual**: `docs/KMS_OPERATIONS.md`
- **Implementation Summary**: `docs/KMS_PRODUCTION_ENHANCEMENTS.md`

## 🔗 Related Files

- Prometheus rules: `prometheus/rules/kms.yml`
- Smoke test scripts: `scripts/smoke-crypto-kms.{py,ps1}`
- Rotation workflow: `.github/workflows/kms-rotate.yml`

## 📞 Support

- **Issues**: https://github.com/leok974/ai-finance-agent-oss/issues
- **Security**: secops@ledger-mind.org
