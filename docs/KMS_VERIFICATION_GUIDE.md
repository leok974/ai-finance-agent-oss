# KMS Production Enhancements – Verification Guide

Complete testing and verification procedures for all KMS monitoring, alerting, and automation components.

## Table of Contents

1. [Production Crypto Health Check](#1-production-crypto-health-check)
2. [Prometheus Rules Verification](#2-prometheus-rules-verification)
3. [AlertManager Routing Test](#3-alertmanager-routing-test)
4. [Grafana Dashboard Verification](#4-grafana-dashboard-verification)
5. [GitHub Actions Dry-Run Test](#5-github-actions-dry-run-test)
6. [GCP Audit Logging Verification](#6-gcp-audit-logging-verification)
7. [Rollback Procedures](#7-rollback-procedures)

---

## 1. Production Crypto Health Check

**Purpose**: Verify KMS crypto system is operational in production.

### Windows PowerShell

```powershell
# One-shot crypto sanity check (production)
$BASE = "https://api.ledger-mind.org"
$h = Invoke-RestMethod "$BASE/healthz"
Write-Host "`nCrypto mode: $($h.crypto_mode) | ready: $($h.crypto_ready)`n" -ForegroundColor Green

if ($h.crypto_mode -ne 'kms' -or -not $h.crypto_ready) {
    throw "❌ Crypto not healthy"
}
Write-Host "✅ Production crypto health verified" -ForegroundColor Green
```

### Linux/macOS

```bash
# One-shot crypto sanity check (production)
BASE="https://api.ledger-mind.org"
health=$(curl -s "$BASE/healthz")
echo "$health" | jq -r '"Crypto mode: \(.crypto_mode) | ready: \(.crypto_ready)"'

# Validate
mode=$(echo "$health" | jq -r '.crypto_mode')
ready=$(echo "$health" | jq -r '.crypto_ready')

if [[ "$mode" != "kms" ]] || [[ "$ready" != "true" ]]; then
    echo "❌ Crypto not healthy"
    exit 1
fi
echo "✅ Production crypto health verified"
```

**Expected Output**:
```
Crypto mode: kms | ready: true
✅ Production crypto health verified
```

---

## 2. Prometheus Rules Verification

**Purpose**: Verify Prometheus rules are loaded and recording rules are working.

### Step 1: Validate Rule Syntax

#### Windows PowerShell

```powershell
# Lint KMS rules file
docker exec prometheus promtool check rules /etc/prometheus/rules/kms.yml

# Expected: "SUCCESS: 7 rules found"
```

#### Linux/macOS

```bash
# Lint KMS rules file
docker exec prometheus promtool check rules /etc/prometheus/rules/kms.yml

# Expected: "SUCCESS: 7 rules found"
```

### Step 2: Reload Prometheus

#### Windows PowerShell

```powershell
# Method 1: Send HUP signal
docker exec prometheus kill -HUP 1

# Method 2: HTTP reload endpoint
Invoke-RestMethod -Method Post -Uri "http://localhost:9090/-/reload"

Write-Host "✅ Prometheus rules reloaded" -ForegroundColor Green
```

#### Linux/macOS

```bash
# Method 1: Send HUP signal
docker exec prometheus kill -HUP 1

# Method 2: HTTP reload endpoint
curl -X POST http://localhost:9090/-/reload

echo "✅ Prometheus rules reloaded"
```

### Step 3: Query Recording Rules

#### Windows PowerShell

```powershell
$PROM = "http://localhost:9090"

# Query 1: Health LED status (should be 0 or 1)
Write-Host "`n=== KMS Crypto Health Status ===" -ForegroundColor Cyan
$result = Invoke-RestMethod "$PROM/api/v1/query?query=kms:crypto_health_status"
$result.data.result | ForEach-Object {
    Write-Host "  $($_.metric.job) [$($_.metric.env)]: $($_.value[1])" -ForegroundColor $(if ($_.value[1] -eq "1") { "Green" } else { "Red" })
}

# Query 2: Decryption error rate (events/sec)
Write-Host "`n=== Decryption Error Rate (5m) ===" -ForegroundColor Cyan
$result = Invoke-RestMethod "$PROM/api/v1/query?query=kms:decryption_error_rate_5m"
$result.data.result | ForEach-Object {
    Write-Host "  $($_.metric.job) [$($_.metric.env)]: $($_.value[1]) errors/sec"
}

# Query 3: Uptime since last crypto init (seconds)
Write-Host "`n=== Uptime Since Crypto Init ===" -ForegroundColor Cyan
$result = Invoke-RestMethod "$PROM/api/v1/query?query=kms:uptime_since_last_crypto_init"
$result.data.result | ForEach-Object {
    $uptime_sec = [int]$_.value[1]
    $uptime_min = [math]::Floor($uptime_sec / 60)
    Write-Host "  $($_.metric.job) [$($_.metric.env)]: ${uptime_min} minutes"
}

Write-Host "`n✅ All recording rules verified" -ForegroundColor Green
```

#### Linux/macOS

```bash
PROM="http://localhost:9090"

# Query 1: Health LED status
echo -e "\n=== KMS Crypto Health Status ==="
curl -s "$PROM/api/v1/query?query=kms:crypto_health_status" | \
  jq -r '.data.result[] | "  \(.metric.job) [\(.metric.env)]: \(.value[1])"'

# Query 2: Decryption error rate
echo -e "\n=== Decryption Error Rate (5m) ==="
curl -s "$PROM/api/v1/query?query=kms:decryption_error_rate_5m" | \
  jq -r '.data.result[] | "  \(.metric.job) [\(.metric.env)]: \(.value[1]) errors/sec"'

# Query 3: Uptime since init
echo -e "\n=== Uptime Since Crypto Init ==="
curl -s "$PROM/api/v1/query?query=kms:uptime_since_last_crypto_init" | \
  jq -r '.data.result[] | "  \(.metric.job) [\(.metric.env)]: \((.value[1] | tonumber / 60 | floor)) minutes"'

echo -e "\n✅ All recording rules verified"
```

**Expected Output**:
```
=== KMS Crypto Health Status ===
  ai-finance-backend [prod]: 1

=== Decryption Error Rate (5m) ===
  ai-finance-backend [prod]: 0 errors/sec

=== Uptime Since Crypto Init ===
  ai-finance-backend [prod]: 45 minutes

✅ All recording rules verified
```

---

## 3. AlertManager Routing Test

**Purpose**: Verify alert routing to Slack/email channels without triggering real outages.

### Inject Synthetic Test Alert

#### Windows PowerShell

```powershell
$AM = "http://localhost:9093"
$now = Get-Date
$end = $now.AddMinutes(5)

$body = @"
[
  {
    "labels": {
      "alertname": "KMS_TEST_RouteOnly",
      "severity": "critical",
      "env": "prod",
      "job": "ai-finance-backend"
    },
    "annotations": {
      "summary": "Route-only test alert",
      "description": "This is a synthetic alert to verify KMS routing and templates.",
      "runbook_url": "https://github.com/leok974/ai-finance-agent-oss/blob/main/docs/KMS_OPERATIONS.md#runbook"
    },
    "generatorURL": "https://grafana/alerting",
    "startsAt": "$($now.ToString('o'))",
    "endsAt": "$($end.ToString('o'))"
  }
]
"@

Write-Host "Sending test alert to AlertManager..." -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri "$AM/api/v1/alerts" `
  -Body $body -ContentType 'application/json' | Out-Null

Write-Host "✅ Test alert sent successfully" -ForegroundColor Green
Write-Host "`nExpected results:" -ForegroundColor Yellow
Write-Host "  • Slack message in #security-critical channel" -ForegroundColor White
Write-Host "  • Email to oncall@ledger-mind.org and secops@ledger-mind.org" -ForegroundColor White
Write-Host "  • Alert includes runbook URL" -ForegroundColor White
Write-Host "`nCheck AlertManager UI: $AM" -ForegroundColor Cyan
```

#### Linux/macOS

```bash
AM="http://localhost:9093"
now=$(date -Iseconds)
end=$(date -Iseconds -d "+5 minutes")

echo "Sending test alert to AlertManager..."
curl -XPOST "$AM/api/v1/alerts" -H 'Content-Type: application/json' -d '[
  {
    "labels": {
      "alertname": "KMS_TEST_RouteOnly",
      "severity": "critical",
      "env": "prod",
      "job": "ai-finance-backend"
    },
    "annotations": {
      "summary": "Route-only test alert",
      "description": "This is a synthetic alert to verify KMS routing and templates.",
      "runbook_url": "https://github.com/leok974/ai-finance-agent-oss/blob/main/docs/KMS_OPERATIONS.md#runbook"
    },
    "generatorURL": "https://grafana/alerting",
    "startsAt": "'"$now"'",
    "endsAt": "'"$end"'"
  }
]'

echo -e "\n✅ Test alert sent successfully"
echo -e "\nExpected results:"
echo "  • Slack message in #security-critical channel"
echo "  • Email to oncall@ledger-mind.org and secops@ledger-mind.org"
echo "  • Alert includes runbook URL"
echo -e "\nCheck AlertManager UI: $AM"
```

### Verify Alert Reception

1. **Slack**: Check `#security-critical` channel for message with:
   - Alert name: `KMS_TEST_RouteOnly`
   - Severity: `critical`
   - Environment: `prod`
   - Runbook link

2. **Email**: Check inboxes for `oncall@` and `secops@` with same details

3. **AlertManager UI**: Visit `http://localhost:9093` and verify alert appears in dashboard

**Success Criteria**:
- ✅ Alert appears in Slack within 10 seconds
- ✅ Email received within 30 seconds
- ✅ Alert includes runbook URL
- ✅ Alert auto-resolves after 5 minutes

---

## 4. Grafana Dashboard Verification

**Purpose**: Import and verify KMS dashboard with LED health indicators.

### Step 1: Import Dashboard

#### Windows PowerShell

```powershell
$GRAFANA = "http://localhost:3000"
$APIKEY = "<your_grafana_api_key>"  # Create via Settings → API Keys

# Read dashboard JSON
$dashboardJson = Get-Content "ops/grafana/dashboards/kms-health.json" -Raw

Write-Host "Importing KMS Health dashboard..." -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Method Post -Uri "$GRAFANA/api/dashboards/db" `
        -Headers @{Authorization="Bearer $APIKEY"} `
        -Body $dashboardJson `
        -ContentType 'application/json'

    Write-Host "✅ Dashboard imported successfully" -ForegroundColor Green
    Write-Host "   Dashboard URL: $GRAFANA$($result.url)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Import failed: $_" -ForegroundColor Red
}
```

#### Linux/macOS

```bash
GRAFANA="http://localhost:3000"
APIKEY="<your_grafana_api_key>"  # Create via Settings → API Keys

echo "Importing KMS Health dashboard..."
result=$(curl -s -X POST "$GRAFANA/api/dashboards/db" \
  -H "Authorization: Bearer $APIKEY" \
  -H "Content-Type: application/json" \
  -d @ops/grafana/dashboards/kms-health.json)

# Check for success
if echo "$result" | jq -e '.status == "success"' > /dev/null; then
    echo "✅ Dashboard imported successfully"
    url=$(echo "$result" | jq -r '.url')
    echo "   Dashboard URL: $GRAFANA$url"
else
    echo "❌ Import failed:"
    echo "$result" | jq .
fi
```

### Step 2: Verify Dashboard

1. **Open Dashboard**: Visit `http://localhost:3000/dashboards`
2. **Find Dashboard**: Search for "KMS Crypto Health Monitor"
3. **Select Variables**:
   - **env**: Select `prod` (or your environment)
   - **service**: Select `ai-finance-backend`

### Step 3: Verify Panels

Expected panels and values:

| Panel | Expected Value | Indicator |
|-------|---------------|-----------|
| **KMS Crypto Health** | `1` | 🟢 Green LED |
| **Crypto Mode** | `kms` | Green stat |
| **Crypto Ready** | `true` | Green stat |
| **Uptime Since Init** | `> 0 minutes` | Time display |
| **Decryption Error Rate** | `0 errors/sec` | Time series (flat line) |
| **Health Check Timeline** | All points at `1` | Time series (flat top line) |
| **KMS Services** | Table with metrics | Data table |
| **Active KMS Alerts** | `0 alerts` | Empty list |

**Success Criteria**:
- ✅ All panels load without errors
- ✅ KMS Crypto Health LED is green (`1`)
- ✅ Variables filter data correctly
- ✅ Time series show historical data
- ✅ No active alerts

---

## 5. GitHub Actions Dry-Run Test

**Purpose**: Verify key rotation workflow without actually rotating keys.

### Step 1: Configure GitHub Environment

```bash
# In your GitHub repository settings:
1. Go to Settings → Environments
2. Create environment named "production"
3. Add required reviewers (yourself or team)
4. Save environment
```

### Step 2: Run Workflow

1. **Navigate**: Go to your GitHub repository
2. **Actions Tab**: Click "Actions"
3. **Select Workflow**: Find "KMS - Monthly Key Rotation"
4. **Run Workflow**: Click "Run workflow" dropdown
5. **Configure**:
   - Branch: `main` (or your branch)
   - **dry_run**: `true` ✅
   - **rotation_type**: `new-dek` (doesn't matter for dry-run)
6. **Start**: Click "Run workflow"

### Step 3: Monitor Execution

Watch the workflow steps:

| Step | Expected Result | Duration |
|------|----------------|----------|
| 1. Pre-rotation smoke test | ✅ Pass | ~30s |
| 2. Backup crypto metadata | ✅ Complete | ~10s |
| 3. **Dry run notice** | ℹ️ "Dry run selected – skipping rotation." | ~1s |
| 4. Post-rotation health check | ⏭️ Skipped | ~0s |
| 5. Generate summary | ✅ Complete | ~5s |

### Step 4: Verify Summary

Check the workflow summary for:

```
✅ Pre-rotation health check passed
✅ Crypto metadata backup complete (backup-YYYYMMDD-HHMMSS.json)
ℹ️ DRY RUN MODE - No rotation performed
✅ Workflow completed successfully
```

**Success Criteria**:
- ✅ Workflow runs to completion
- ✅ Pre-smoke test passes
- ✅ Backup is created
- ✅ Dry-run notice appears in logs
- ✅ No actual rotation occurs
- ✅ Summary is generated

### Production Rotation

When ready for real rotation:

1. Run workflow with `dry_run = false`
2. Select rotation type: `new-dek` or `rewrap-kek`
3. Approve in GitHub environment (if configured)
4. Monitor all steps including post-rotation health checks
5. Verify crypto status after completion

---

## 6. GCP Audit Logging Verification

**Purpose**: Verify KMS API calls are being logged to Cloud Logging and optional sinks.

### Step 1: Check Recent KMS Events

#### Using gcloud CLI

```bash
# View last 10 KMS API calls from the past hour
gcloud logging read \
  'resource.type="audited_resource"
   AND protoPayload.serviceName="cloudkms.googleapis.com"
   AND timestamp>="'$(date -u -d "60 minutes ago" +%Y-%m-%dT%H:%M:%SZ)'"' \
  --project=ledgermind-03445-3l \
  --limit=10 \
  --format="table(timestamp,protoPayload.methodName,protoPayload.authenticationInfo.principalEmail)"
```

**Expected Output**:
```
TIMESTAMP                   METHOD_NAME                      PRINCIPAL_EMAIL
2025-10-06T15:23:45.123Z   Decrypt                          backend-sa@...
2025-10-06T15:22:12.456Z   Encrypt                          backend-sa@...
2025-10-06T15:20:33.789Z   Decrypt                          backend-sa@...
...
```

### Step 2: Query BigQuery Sink (if configured)

```sql
-- Recent KMS API calls (last hour)
SELECT
  timestamp,
  protoPayload.methodName AS method,
  protoPayload.authenticationInfo.principalEmail AS caller,
  protoPayload.status.code AS status_code,
  protoPayload.resourceName AS resource
FROM `ledgermind-03445-3l.kms_audit.cloudaudit_googleapis_com_activity_*`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
  AND protoPayload.serviceName = 'cloudkms.googleapis.com'
ORDER BY timestamp DESC
LIMIT 20;
```

### Step 3: Verify GCS Sink (if configured)

#### Windows PowerShell

```powershell
# List recent audit log files
gsutil ls -lh gs://ledgermind-kms-audit-logs/logs/cloudaudit.googleapis.com/ | Select-Object -Last 10
```

#### Linux/macOS

```bash
# List recent audit log files
gsutil ls -lh gs://ledgermind-kms-audit-logs/logs/cloudaudit.googleapis.com/ | tail -10
```

### Step 4: Generate Test Traffic

Trigger some KMS operations to verify logging:

#### Windows PowerShell

```powershell
# Make API calls to trigger KMS operations
$BASE = "http://localhost:8000"
Invoke-RestMethod "$BASE/healthz" | Out-Null
Start-Sleep -Seconds 2
Invoke-RestMethod "$BASE/rules" | Out-Null

Write-Host "✅ Generated test traffic - check logs in 30 seconds" -ForegroundColor Green
```

#### Linux/macOS

```bash
# Make API calls to trigger KMS operations
BASE="http://localhost:8000"
curl -s "$BASE/healthz" > /dev/null
sleep 2
curl -s "$BASE/rules" > /dev/null

echo "✅ Generated test traffic - check logs in 30 seconds"
```

Wait 30-60 seconds for logs to propagate, then re-run the gcloud/BigQuery queries.

**Success Criteria**:
- ✅ Recent KMS events appear in Cloud Logging
- ✅ Decrypt/Encrypt methods are logged
- ✅ Service account email matches your backend SA
- ✅ BigQuery sink shows data (if configured)
- ✅ GCS bucket contains log files (if configured)
- ✅ Test traffic appears in logs within 60 seconds

---

## 7. Rollback Procedures

Quick rollback commands if you need to disable any component.

### Rollback Alerts (AlertManager)

#### Windows PowerShell

```powershell
# Comment out KMS routing in alertmanager config
$config = Get-Content "ops/alertmanager/kms.yml" -Raw
$config = $config -replace '(?m)^(\s*- match:)', '#$1'
$config | Set-Content "ops/alertmanager/kms.yml"

# Reload AlertManager
docker exec alertmanager kill -HUP 1

Write-Host "✅ KMS alerts disabled" -ForegroundColor Yellow
```

#### Linux/macOS

```bash
# Comment out KMS routing block
sed -i.bak 's/^\(\s*- match:\)/#\1/' ops/alertmanager/kms.yml

# Reload AlertManager
docker exec alertmanager kill -HUP 1

echo "✅ KMS alerts disabled"
```

### Rollback Prometheus Rules

#### Windows PowerShell

```powershell
# Remove KMS rules file from Prometheus config
Move-Item "prometheus/rules/kms.yml" "prometheus/rules/kms.yml.disabled"

# Reload Prometheus
Invoke-RestMethod -Method Post -Uri "http://localhost:9090/-/reload"

Write-Host "✅ KMS rules disabled" -ForegroundColor Yellow
```

#### Linux/macOS

```bash
# Move rules file
mv prometheus/rules/kms.yml prometheus/rules/kms.yml.disabled

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload

echo "✅ KMS rules disabled"
```

### Rollback Grafana Dashboard

1. **Option 1 - Unpublish**:
   - Go to dashboard settings → "Make Private" or "Delete"

2. **Option 2 - Star/Hide**:
   - Remove from main dashboards folder
   - Move to "Archive" folder

### Rollback GitHub Actions Workflow

#### Disable Scheduled Rotation

```bash
# Edit workflow file
# Comment out the schedule section:

# Disabled for rollback
# on:
#   schedule:
#     - cron: "0 9 1 * *"

# Commit and push
git add .github/workflows/kms-rotate.yml
git commit -m "Disable KMS rotation schedule"
git push
```

Manual workflow_dispatch triggers will still work.

### Rollback Audit Logging

#### Disable Data Access Logs

```bash
# Remove Data Access audit config
gcloud projects set-iam-policy ledgermind-03445-3l <(
  gcloud projects get-iam-policy ledgermind-03445-3l --format=json | \
  jq 'del(.auditConfigs[] | select(.service=="cloudkms.googleapis.com"))'
)

echo "✅ KMS audit logging disabled"
```

#### Remove BigQuery Sink

```bash
gcloud logging sinks delete kms-audit-bigquery --project=ledgermind-03445-3l
```

#### Remove GCS Sink

```bash
gcloud logging sinks delete kms-audit-gcs --project=ledgermind-03445-3l
```

---

## Quick Verification Checklist

Use this checklist to verify all components:

- [ ] **Production Health**: `crypto_mode=kms`, `crypto_ready=true`
- [ ] **Prometheus Rules**: All 7 alerts + 3 recording rules loaded
- [ ] **Recording Rules**: `kms:crypto_health_status` returns `0` or `1`
- [ ] **AlertManager**: Test alert received in Slack + email
- [ ] **Grafana Dashboard**: Imported, variables work, LED is green
- [ ] **GitHub Actions**: Dry-run completes successfully
- [ ] **Audit Logging**: Recent KMS events visible in Cloud Logging
- [ ] **BigQuery Sink**: Data flowing (if configured)
- [ ] **GCS Sink**: Files appearing (if configured)

---

## Troubleshooting

### Issue: Recording rules return no data

**Cause**: Prometheus hasn't scraped backend yet

**Fix**: Wait 30s for next scrape, or check Prometheus targets are `UP`

### Issue: Test alert not received

**Cause**: AlertManager env vars not set (SENDGRID_API_KEY, Slack webhook)

**Fix**: Verify secrets in `ops/alertmanager/kms.yml` are populated

### Issue: Grafana dashboard shows "No Data"

**Cause**: Time range or variable selection incorrect

**Fix**: Set time range to "Last 1 hour" and verify variables are selected

### Issue: Audit logs not appearing

**Cause**: IAM permissions or API not enabled

**Fix**: Re-run `scripts/setup-kms-audit-logging.sh` with `-x` debug mode

### Issue: Workflow fails approval

**Cause**: GitHub environment not configured

**Fix**: Remove `environment: production` line or configure environment in Settings

---

## Support

- **Documentation**: See `docs/KMS_OPERATIONS.md` for runbooks
- **Setup Guide**: See `docs/KMS_SETUP_CHECKLIST.md` for implementation
- **Reference**: See `docs/KMS_PRODUCTION_ENHANCEMENTS.md` for architecture

For issues, check the troubleshooting section or contact your team's DevOps/SRE.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-06
**Maintained By**: DevOps Team
