# KMS Production Enhancements - Setup Checklist

**Date**: October 6, 2025
**Status**: Ready for Implementation

This document provides a step-by-step checklist for implementing the complete KMS monitoring, automation, and audit logging stack.

---

## 📋 Quick "Done/Done" Checklist

### 1. ✅ Grafana Dashboard Setup

**File**: `ops/grafana/dashboards/kms-health.json`

- [ ] Import dashboard into Grafana
- [ ] Verify variables work (env, service)
- [ ] Verify all panels display data
- [ ] Configure auto-refresh (30s recommended)
- [ ] Set dashboard permissions
- [ ] Bookmark dashboard URL

**Steps**:
```bash
# Option A: Import via Grafana UI
# 1. Login to Grafana
# 2. Click "+" → "Import"
# 3. Upload ops/grafana/dashboards/kms-health.json
# 4. Select Prometheus datasource
# 5. Click "Import"

# Option B: Import via API (automated)
curl -X POST http://grafana.ledger-mind.org/api/dashboards/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  -d @ops/grafana/dashboards/kms-health.json
```

**Verification**:
- Navigate to https://grafana.ledger-mind.org/d/kms-crypto-health
- All panels show data
- Variables filter correctly
- "KMS Crypto Health" LED shows green (1 = Healthy)

---

### 2. ✅ AlertManager Routing Configuration

**File**: `ops/alertmanager/kms.yml`

- [ ] Review and customize notification channels
- [ ] Update Slack channel names (if different)
- [ ] Update email addresses
- [ ] Configure SMTP settings (if using email)
- [ ] (Optional) Add PagerDuty integration
- [ ] Merge with main AlertManager config
- [ ] Reload AlertManager

**Steps**:

**Option A: Standalone AlertManager config** (simple)
```bash
# Copy as main config
cp ops/alertmanager/kms.yml /path/to/alertmanager/alertmanager.yml

# Reload AlertManager
docker exec alertmanager kill -HUP 1
# OR
curl -X POST http://localhost:9093/-/reload
```

**Option B: Merge with existing config** (recommended)
```bash
# 1. Open your main alertmanager.yml
# 2. Copy the 'routes' section from ops/alertmanager/kms.yml
# 3. Add as child routes under your main route
# 4. Copy the 'receivers' section (kms-security, kms-critical)
# 5. Add to your receivers list
# 6. Copy 'inhibit_rules' (merge with existing)

# Validate config
docker exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml

# Reload
docker exec alertmanager kill -HUP 1
```

**Environment Variables**:
```bash
# Add to docker-compose.yml or .env
SENDGRID_API_KEY=your_sendgrid_api_key_here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Verification**:
```bash
# Check config loaded
curl http://localhost:9093/api/v1/status | jq .

# Test alert routing (optional - fires test alert)
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {"alertname":"KMSTest","severity":"warning","env":"dev"},
  "annotations": {"summary":"Test alert"}
}]'
```

---

### 3. ✅ Automated Key Rotation Workflow

**File**: `.github/workflows/kms-rotate.yml`

- [ ] Review workflow configuration
- [ ] Choose implementation path (self-hosted vs endpoints)
- [ ] Configure production environment protection
- [ ] Add required reviewers for rotation approval
- [ ] Test dry-run mode
- [ ] Schedule first rotation

**Steps**:

**Environment Protection** (GitHub Settings):
```
1. Go to: Settings → Environments → New environment
2. Name: "production"
3. Configure protection rules:
   - ✅ Required reviewers: [Add security team members]
   - ✅ Wait timer: 0 minutes (approval required)
   - Environment secrets:
     - ADMIN_TOKEN (if using API endpoints)
```

**Implementation Paths** (choose one):

**Path A: Self-Hosted Runner** (simplest)
```yaml
# In .github/workflows/kms-rotate.yml, change:
runs-on: ubuntu-latest
# To:
runs-on: [self-hosted, prod]

# Uncomment all Docker commands in workflow
# Setup runner: https://docs.github.com/en/actions/hosting-your-own-runners
```

**Path B: Admin API Endpoints** (most secure)
```python
# Add to apps/backend/app/api/admin.py

from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_admin_token

router = APIRouter(prefix="/admin")

@router.post("/crypto/rotate-dek")
async def rotate_dek(token: str = Depends(require_admin_token)):
    """Rotate active DEK (KMS-wrapped)"""
    subprocess.run(["python", "-m", "app.cli", "force-new-active-dek"], check=True)
    return {"status": "success"}

@router.post("/crypto/rewrap-kek")
async def rewrap_kek(token: str = Depends(require_admin_token)):
    """Rewrap KEK with current KMS key"""
    subprocess.run(["python", "-m", "app.cli", "kek-rewrap-gcp"], check=True)
    return {"status": "success"}
```

**Test Dry-Run**:
```bash
# Via GitHub UI:
# 1. Go to Actions → KMS - Monthly Key Rotation
# 2. Click "Run workflow"
# 3. Select branch: main
# 4. Dry run: true
# 5. Click "Run workflow"
# 6. Verify pre-checks pass
```

**Verification**:
- Dry-run workflow completes successfully
- Approval gate requires manual approval
- Post-rotation health checks pass

---

### 4. ✅ GCP Audit Logging Setup

**Files**:
- `scripts/setup-kms-audit-logging.sh` (Linux/macOS)
- `scripts/setup-kms-audit-logging.ps1` (Windows)

- [ ] Run setup script
- [ ] Enable Data Access logs
- [ ] (Optional) Set up BigQuery sink
- [ ] (Optional) Set up GCS sink
- [ ] Verify logs flowing
- [ ] Create log-based metrics (optional)
- [ ] Set up audit alerts (optional)

**Steps**:

**Linux/macOS**:
```bash
# Make executable
chmod +x scripts/setup-kms-audit-logging.sh

# Run interactively
./scripts/setup-kms-audit-logging.sh

# Or with all options
./scripts/setup-kms-audit-logging.sh --setup-bigquery --setup-gcs
```

**Windows (PowerShell)**:
```powershell
# Run interactively
.\scripts\setup-kms-audit-logging.ps1

# Or with all options
.\scripts\setup-kms-audit-logging.ps1 -SetupBigQuery -SetupGCS
```

**Manual Setup** (if scripts fail):
```bash
# 1. Enable KMS API
gcloud services enable cloudkms.googleapis.com --project=ledgermind-03445-3l

# 2. Enable Data Access logs
# Go to: GCP Console → IAM & Admin → Audit Logs
# Find: Cloud KMS API
# Enable: Admin Read, Data Read, Data Write

# 3. Create BigQuery dataset (optional)
bq --location=US mk -d --description "KMS audit logs" ledgermind-03445-3l:kms_audit

# 4. Create log sink to BigQuery
gcloud logging sinks create kms-audit-bq \
  bigquery.googleapis.com/projects/ledgermind-03445-3l/datasets/kms_audit \
  --log-filter='resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"' \
  --project=ledgermind-03445-3l

# 5. Grant permissions to sink service account (shown in output)
```

**Verification**:
```bash
# Wait 5-10 minutes, then query logs
gcloud logging read \
  'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"' \
  --limit=10 \
  --format=json

# Check BigQuery (if enabled)
bq query --use_legacy_sql=false \
  'SELECT timestamp, protopayload_auditlog.methodName
   FROM `ledgermind-03445-3l.kms_audit.cloudaudit_googleapis_com_data_access_*`
   ORDER BY timestamp DESC LIMIT 10'
```

---

### 5. ✅ Prometheus Rules Reload

**Files**:
- `prometheus/rules/kms.yml`
- `ops/alerts/kms.yml`

- [ ] Validate rule syntax
- [ ] Load into Prometheus
- [ ] Verify rules active
- [ ] Test alert firing (optional)

**Steps**:

**Validate Syntax**:
```bash
# If Prometheus is in Docker
docker exec prometheus promtool check rules /etc/prometheus/rules/kms.yml

# If using local promtool
promtool check rules prometheus/rules/kms.yml
promtool check rules ops/alerts/kms.yml
```

**Load into Prometheus**:

**Option A: Mount as volume** (recommended)
```yaml
# In docker-compose.yml (prometheus service)
volumes:
  - ./prometheus/rules:/etc/prometheus/rules:ro
  - ./ops/alerts:/etc/prometheus/alerts:ro

# In prometheus.yml
rule_files:
  - /etc/prometheus/rules/*.yml
  - /etc/prometheus/alerts/*.yml
```

**Option B: Copy into running container**
```bash
docker cp prometheus/rules/kms.yml prometheus:/etc/prometheus/rules/
docker cp ops/alerts/kms.yml prometheus:/etc/prometheus/alerts/
```

**Reload Prometheus**:
```bash
# Send SIGHUP to reload
docker exec prometheus kill -HUP 1

# OR via API
curl -X POST http://localhost:9090/-/reload

# OR restart container
docker compose restart prometheus
```

**Verification**:
```bash
# Check rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="kms_crypto")'

# Verify recording rules
curl http://localhost:9090/api/v1/query?query=kms:crypto_health_status

# Check no errors
docker logs prometheus --tail 50 | grep -i error
```

---

### 6. ✅ Documentation Review

**File**: `docs/KMS_OPERATIONS.md`

- [ ] Review runbook section
- [ ] Bookmark runbook URL for team
- [ ] Add to on-call documentation
- [ ] Train team on procedures
- [ ] Update wiki/internal docs with links

**Team Training Checklist**:
- [ ] Share Grafana dashboard URL
- [ ] Explain alert severities and escalation
- [ ] Walk through common runbook procedures
- [ ] Show how to check Prometheus metrics
- [ ] Demonstrate dry-run rotation workflow
- [ ] Review audit log access

**Documentation Links**:
```
Runbook: https://github.com/leok974/ai-finance-agent-oss/blob/main/docs/KMS_OPERATIONS.md#runbook
Dashboard: https://grafana.ledger-mind.org/d/kms-crypto-health
Alerts: https://alertmanager.ledger-mind.org/
Metrics: https://prometheus.ledger-mind.org/graph
```

---

## 🔍 Post-Implementation Validation

### End-to-End Test

1. **Verify Monitoring**:
   ```bash
   # Check health endpoint
   curl https://api.ledger-mind.org/healthz | jq .

   # Verify Prometheus scraping
   curl http://localhost:9090/api/v1/query?query=up{job="backend"}

   # Check Grafana dashboard loads
   curl -I https://grafana.ledger-mind.org/d/kms-crypto-health
   ```

2. **Test Alert Flow**:
   ```bash
   # Fire test alert
   curl -X POST http://localhost:9093/api/v1/alerts -d '[{
     "labels": {"alertname":"KMSTest","severity":"warning","env":"production"},
     "annotations": {"summary":"Test alert for validation"}
   }]'

   # Verify received in:
   # - Slack channel
   # - Email inbox
   # - AlertManager UI
   ```

3. **Verify Audit Logs**:
   ```bash
   # Trigger KMS operation
   docker exec ai-finance-backend-1 python -m app.cli crypto-status

   # Wait 2 minutes, then check logs
   gcloud logging read \
     'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"' \
     --limit=5 \
     --format=json
   ```

4. **Test Rotation Workflow**:
   ```bash
   # Run dry-run via GitHub Actions
   # (See section 3 above)

   # Verify all steps complete
   # Verify approval gate works
   ```

### Smoke Test All Components

```bash
# Run comprehensive smoke test
python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org --verbose

# Expected: ✅ PASS: KMS mode active and healthy
```

---

## 📊 Success Criteria

All items below should be ✅ after implementation:

- [ ] Grafana dashboard accessible and showing live data
- [ ] All dashboard panels display correctly
- [ ] AlertManager routing configured and tested
- [ ] Test alert received in Slack and email
- [ ] Rotation workflow dry-run completes successfully
- [ ] Approval gate requires manual approval
- [ ] GCP audit logs enabled and flowing
- [ ] BigQuery/GCS sinks created (if opted in)
- [ ] Prometheus rules loaded without errors
- [ ] Recording rules returning data
- [ ] Runbook reviewed and bookmarked by team
- [ ] On-call rotation includes KMS procedures
- [ ] Smoke test passing against production

---

## 🆘 Troubleshooting Setup Issues

### Grafana Dashboard Not Showing Data

```bash
# Check Prometheus datasource configured
curl http://grafana:3000/api/datasources

# Verify Prometheus has data
curl http://prometheus:9090/api/v1/query?query=crypto_mode

# Check backend exposing metrics
curl http://backend:8000/metrics | grep crypto_mode
```

### AlertManager Not Sending Notifications

```bash
# Check AlertManager logs
docker logs alertmanager --tail 100

# Verify routing config
curl http://localhost:9093/api/v1/status | jq .config

# Test SMTP connection (if using email)
docker exec alertmanager nc -zv smtp.sendgrid.net 587
```

### Rotation Workflow Failing

```bash
# Check GitHub Actions logs
# Navigate to: Actions → KMS - Monthly Key Rotation → [Latest run]

# Common issues:
# 1. Environment not configured: Add "production" environment in repo settings
# 2. No reviewers configured: Add required reviewers
# 3. Missing secrets: Add ADMIN_TOKEN if using API endpoints
# 4. Self-hosted runner offline: Check runner status
```

### Audit Logs Not Appearing

```bash
# Verify IAM permissions for logging
gcloud projects get-iam-policy ledgermind-03445-3l | grep logging

# Check if audit config applied
gcloud logging settings describe --project=ledgermind-03445-3l

# Trigger test operation
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Wait 5-10 minutes and check again
```

---

## 📅 Next Steps After Setup

1. **Week 1**: Monitor dashboards daily, tune alert thresholds
2. **Week 2**: Verify no false positives, adjust inhibit rules
3. **Month 1**: Run first key rotation (use dry-run first!)
4. **Month 2**: Review audit logs, create BigQuery reports
5. **Quarter 1**: Full system review, update documentation

---

## 📞 Support

- **Issues**: https://github.com/leok974/ai-finance-agent-oss/issues
- **Documentation**: `docs/KMS_OPERATIONS.md`
- **On-call**: oncall@ledger-mind.org
- **Security**: secops@ledger-mind.org

---

**Setup Status**: Ready for Implementation
**Estimated Time**: 2-4 hours (initial setup)
**Maintenance**: ~1 hour/month (monitoring + rotation)
