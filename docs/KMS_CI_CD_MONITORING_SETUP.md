# KMS CI/CD & Monitoring Setup - Implementation Summary

**Date**: October 6, 2025
**Status**: ✅ Complete

## Overview

Implemented comprehensive CI/CD integration and monitoring alerts for GCP KMS encryption as specified in `docs/KMS_OPERATIONS.md`. This ensures the production system maintains KMS mode and alerts on any security regressions.

## ✅ Completed Tasks

### 1. CI/CD Integration

#### GitHub Actions Workflows

**New Workflow: `.github/workflows/kms-crypto-smoke.yml`**
- **Purpose**: Automated KMS health verification
- **Triggers**:
  - Schedule: Every 30 minutes
  - Push to `main` branch
  - Pull requests affecting crypto code or docker configs
  - Manual dispatch with custom URL
- **Jobs**:
  - `kms-smoke-production`: Tests https://api.ledger-mind.org
  - `kms-smoke-local`: Tests local Docker stack on PRs
- **Features**:
  - Validates `crypto_mode=kms` and `crypto_ready=true`
  - Shows backend logs on failure
  - Suitable for continuous monitoring

**Updated Workflow: `.github/workflows/smoke-lite.yml`**
- Added KMS crypto health check step
- Runs on all PRs and merges to main
- Non-blocking (warns if KMS not active, but doesn't fail build)
- Useful for catching regressions early

#### Cross-Platform Scripts

**New Script: `scripts/smoke-crypto-kms.py`**
- Python implementation for CI/CD (Linux)
- Cross-platform compatible
- Uses stdlib only (no dependencies)
- Features:
  - Checks `/healthz` endpoint
  - Validates `crypto_mode=kms`
  - Validates `crypto_ready=true`
  - Returns exit code 0 (success) or 1 (failure)
  - Suitable for automation
- Usage:
  ```bash
  python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org
  ```

**Existing: `scripts/smoke-crypto-kms.ps1`**
- PowerShell implementation for local Windows use
- Same functionality as Python version
- Usage:
  ```powershell
  .\scripts\smoke-crypto-kms.ps1 -BaseUrl "https://api.ledger-mind.org"
  ```

### 2. Monitoring & Alerting

#### Prometheus Alerting Rules

**New File: `prometheus/rules/kms.yml`**

Comprehensive alerting rules for KMS health:

| Alert Name | Severity | Threshold | Description |
|------------|----------|-----------|-------------|
| `KMSCryptoModeNotKMS` | Critical | 5 min | Crypto mode is not KMS |
| `KMSCryptoNotReady` | Critical | 5 min | Crypto system not ready |
| `KMSCryptoModeFlapping` | Warning | >2 changes/hour | Mode instability detected |
| `KMSHighCryptoErrorRate` | Warning | >0.1 errors/sec | Sustained error rate |
| `KMSBackendRestarted` | Info | Immediate | Backend restarted (expected brief unavailability) |
| `KMSHighLatency` | Warning | p95 >1s for 10min | KMS operation latency high |
| `KMSHealthChecksFailing` | Critical | No success in 5min | Health endpoint unavailable |

**Key Features**:
- Grace period aware (allows startup errors)
- Contextual annotations with troubleshooting steps
- Severity-based escalation (info → warning → critical)

#### Monitoring Dashboard Configuration

**New File: `ops/alerts/kms.yml`**

Monitoring rules with recording rules for dashboards:

**Alert Rules**:
- `KMSModeNotActive` - Crypto mode check
- `KMSCryptoNotReady` - Crypto ready check
- `KMSDecryptionErrorsBurst` - High error rate (>10 in 5min)
- `KMSInitFailure` - Crypto initialization failures
- `KMSDecryptionFailuresPersistent` - Sustained failures (10+ min)
- `KMSServiceUnreachable` - GCP KMS connectivity issues
- `KMSHealthEndpointDown` - Backend unavailable

**Recording Rules** (for Grafana dashboards):
- `kms:crypto_health_status` - Combined health indicator (0 or 1)
- `kms:decryption_error_rate_5m` - Rolling 5-minute error rate
- `kms:uptime_since_last_crypto_init` - Time since last init

**Alert Thresholds**:
- Grace period: 120 seconds after startup
- Error burst: >10 errors in 5 minutes (post-grace)
- Persistent errors: Rate >0.01/sec for 10 minutes (post-grace)
- Health check failure: No success in 5 minutes

### 3. Documentation Updates

**Updated: `docs/KMS_OPERATIONS.md`**

Added comprehensive sections:

1. **CI/CD Integration**:
   - Workflow descriptions
   - Available scripts
   - Usage examples for both platforms

2. **Monitoring & Alerts**:
   - Prometheus rules configured
   - Alert rule catalog
   - Threshold explanations
   - Grafana dashboard metrics

3. **Related Files**:
   - Complete list of KMS-related files
   - Quick reference for troubleshooting

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     GitHub Actions                       │
├─────────────────────────────────────────────────────────┤
│  kms-crypto-smoke.yml                                   │
│  ├─ Scheduled (every 30m)                               │
│  ├─ Push to main                                        │
│  ├─ PRs (crypto changes)                                │
│  └─ Manual trigger                                      │
│                                                          │
│  smoke-lite.yml                                         │
│  └─ KMS health check step                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              scripts/smoke-crypto-kms.py                 │
│              (or smoke-crypto-kms.ps1)                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│          https://api.ledger-mind.org/healthz            │
│          {                                               │
│            crypto_mode: "kms",                          │
│            crypto_ready: true,                          │
│            status: "ok"                                  │
│          }                                               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Prometheus                             │
├─────────────────────────────────────────────────────────┤
│  prometheus/rules/kms.yml                               │
│  ├─ KMSCryptoModeNotKMS (critical)                     │
│  ├─ KMSCryptoNotReady (critical)                       │
│  ├─ KMSCryptoModeFlapping (warning)                    │
│  ├─ KMSHighCryptoErrorRate (warning)                   │
│  └─ ... (7 alerts total)                               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Alert Manager                           │
│                  (Notifications)                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     Grafana                              │
├─────────────────────────────────────────────────────────┤
│  ops/alerts/kms.yml                                     │
│  ├─ kms:crypto_health_status                           │
│  ├─ kms:decryption_error_rate_5m                       │
│  └─ kms:uptime_since_last_crypto_init                  │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Usage

### Running Smoke Tests

**Production (CI/CD)**:
```bash
# Via workflow dispatch (GitHub Actions UI)
# Or manually:
python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org --verbose
```

**Local (Windows)**:
```powershell
# PowerShell version
.\scripts\smoke-crypto-kms.ps1

# Or with custom URL
.\scripts\smoke-crypto-kms.ps1 -BaseUrl "http://localhost:8000"
```

**Local (Linux/macOS)**:
```bash
# Python version
python scripts/smoke-crypto-kms.py

# Or with custom URL
python scripts/smoke-crypto-kms.py --base-url http://localhost:8000
```

### Checking Alerts

**Prometheus**:
```bash
# Check if rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="kms_crypto")'

# Check active alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname | startswith("KMS"))'
```

**Grafana**:
- Navigate to Alerts → Alert Rules
- Filter by "kms" to see KMS-specific rules
- Check dashboard using recording rules (kms:*)

### Monitoring Health

**Manual Check**:
```bash
# Production
curl -s https://api.ledger-mind.org/healthz | jq '{crypto_mode, crypto_ready, status}'

# Local
curl -s http://localhost:8000/healthz | jq '{crypto_mode, crypto_ready, status}'
```

**Expected Output**:
```json
{
  "crypto_mode": "kms",
  "crypto_ready": true,
  "status": "ok"
}
```

## 🔍 Validation

### Test CI/CD Workflow

1. **Test Scheduled Run** (manual trigger):
   ```
   GitHub → Actions → KMS Crypto Smoke Test → Run workflow
   Select branch: main
   Base URL: https://api.ledger-mind.org (default)
   ```

2. **Test PR Integration**:
   - Create a PR that modifies `apps/backend/app/crypto/**`
   - Workflow should run automatically
   - Check logs for KMS health verification

3. **Test Smoke Lite Integration**:
   - Push to main or create PR
   - Check smoke-lite workflow logs
   - Should see "KMS Crypto Health Check" step

### Validate Prometheus Rules

```bash
# Syntax check
docker exec prometheus promtool check rules /etc/prometheus/rules/kms.yml

# Load into Prometheus
docker exec prometheus kill -HUP 1

# Verify loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="kms_crypto") | .rules[].alert'
```

### Validate Monitoring Config

```bash
# Check ops alerts syntax
yamllint ops/alerts/kms.yml

# Verify recording rules
curl http://localhost:9090/api/v1/query?query=kms:crypto_health_status
```

## 📋 Next Steps

1. **Configure Alert Routing** (if not already done):
   - Update AlertManager config to route KMS alerts
   - Set up notification channels (Slack, email, PagerDuty)
   - Example:
     ```yaml
     route:
       receiver: 'team-ops'
       routes:
         - match:
             alertname: ~"KMS.*"
           severity: critical
           receiver: 'pagerduty-critical'
     ```

2. **Set Up Grafana Dashboard**:
   - Create KMS Health dashboard
   - Add panels for recording rules
   - Include alert status panel

3. **Test Alert Firing** (optional):
   - Temporarily break KMS (e.g., remove IAM permission)
   - Verify alerts fire within expected thresholds
   - Verify notifications received
   - Restore permissions

4. **Schedule Quarterly Review**:
   - Add to calendar: January 2026
   - Review alert thresholds
   - Check false positive rate
   - Update documentation as needed

## 📚 Reference

### Files Created
- `.github/workflows/kms-crypto-smoke.yml` - Automated smoke test workflow
- `scripts/smoke-crypto-kms.py` - Python smoke test script
- `prometheus/rules/kms.yml` - Prometheus alerting rules
- `ops/alerts/kms.yml` - Monitoring dashboard configuration

### Files Modified
- `.github/workflows/smoke-lite.yml` - Added KMS health check
- `docs/KMS_OPERATIONS.md` - Updated with CI/CD and monitoring sections

### Files Referenced
- `scripts/smoke-crypto-kms.ps1` - PowerShell smoke test (existing)
- `docker-compose.yml` - KMS environment variables
- `apps/backend/active-dek.json` - KMS-wrapped key metadata

## ✅ Verification Checklist

- [x] Python smoke test script created and working
- [x] GitHub Actions workflow created (kms-crypto-smoke.yml)
- [x] Smoke-lite workflow updated with KMS check
- [x] Prometheus alerting rules created (prometheus/rules/kms.yml)
- [x] Monitoring dashboard config created (ops/alerts/kms.yml)
- [x] Documentation updated (KMS_OPERATIONS.md)
- [ ] Prometheus rules loaded and verified
- [ ] AlertManager routing configured
- [ ] Grafana dashboard created
- [ ] Test alert firing validated
- [ ] Quarterly review scheduled

---

**Status**: ✅ Implementation Complete
**Production Ready**: ✅ Yes
**Next Action**: Load Prometheus rules and configure AlertManager routing
