# GCP KMS Hardening & Operations Guide

## ✅ System Status (As of Oct 6, 2025)

- **Crypto Mode**: ✅ KMS
- **Crypto Ready**: ✅ True
- **Database**: ✅ Connected
- **All Services**: ✅ Operational

## 🔒 Security Hardening Completed

### 1. KMS Configuration
- ✅ GCP KMS Key: `projects/ledgermind-03445-3l/locations/us-east1/keyRings/ledgermind/cryptoKeys/kek`
- ✅ Service Account: `ledgermind-backend@ledgermind-03445-3l.iam.gserviceaccount.com`
- ✅ IAM Role: `roles/cloudkms.cryptoKeyEncrypterDecrypter`
- ✅ AAD: `app=ledgermind,env=dev`

### 2. Environment Variables (Verified)
```bash
ENCRYPTION_ENABLED=1
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-sa.json
GCP_KMS_KEY=projects/ledgermind-03445-3l/locations/us-east1/keyRings/ledgermind/cryptoKeys/kek
GCP_KMS_AAD=app=ledgermind,env=dev
```

### 3. Backup & Recovery
- ✅ Encryption keys metadata backed up: `encryption_keys_snapshot.csv`
- ✅ Service account JSON: `C:\secrets\ledgermind-backend-sa.json`
- ✅ `.gitignore` protecting sensitive files

### 4. Verification Scripts
- ✅ Smoke test: `scripts/smoke-crypto-kms.ps1`

## 📋 Operational Procedures

### Daily Health Checks

```powershell
# Quick status check
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Full health check
Invoke-RestMethod http://localhost:8000/healthz | Select-Object crypto_mode, crypto_ready, status

# Or use the smoke test script
.\scripts\smoke-crypto-kms.ps1
```

Expected output:
- `crypto_mode`: `kms`
- `crypto_ready`: `True`
- `status`: `ok`

### Backup Encryption Keys Metadata

```powershell
# Create dated backup
$date = Get-Date -Format "yyyyMMdd-HHmmss"
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "COPY (SELECT id,label,kms_key_id,created_at FROM encryption_keys ORDER BY created_at) TO STDOUT WITH CSV HEADER" `
  > "backups/encryption_keys_$date.csv"
```

### Key Rotation Procedures

#### Rewrap KEK with KMS (No data re-encryption)
When you need to change the KMS key or update wrapping:

```powershell
# Backup first
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "COPY encryption_keys TO STDOUT WITH CSV HEADER" > backup_before_rewrap.csv

# Rewrap
docker exec ai-finance-backend-1 python -m app.cli kek-rewrap-gcp

# Verify
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Test
.\scripts\smoke-crypto-kms.ps1
```

#### Create New Active DEK (Re-encrypts new data only)
When you want to rotate the data encryption key:

```powershell
# Backup first
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "COPY encryption_keys TO STDOUT WITH CSV HEADER" > backup_before_rotate.csv

# Create new DEK
docker exec ai-finance-backend-1 python -m app.cli force-new-active-dek

# Verify
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Check database
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "SELECT label, created_at FROM encryption_keys ORDER BY created_at DESC LIMIT 3;"

# Test
.\scripts\smoke-crypto-kms.ps1
```

**Note**: Old DEKs remain readable. New data uses the new active DEK. To fully migrate all data to the new DEK, use the rotation playbook.

## 🚨 Monitoring & Alerts

### Health Endpoint Monitoring

Add to your monitoring system:

```powershell
# Check crypto mode
$health = Invoke-RestMethod "https://api.ledger-mind.org/healthz"
if ($health.crypto_mode -ne 'kms') {
    Send-Alert "Crypto mode is not KMS: $($health.crypto_mode)"
}
if (-not $health.crypto_ready) {
    Send-Alert "Crypto is not ready"
}
```

### Log Monitoring

Watch for these patterns in production logs:

**Normal (startup)**:
```
[CRYPTO] KMS unwrap OK | key=projects/... | aad=app=ledgermind,env=dev
```

**Alert on** (after steady state):
```
crypto init failed
Decryption failed
KEK env not set
403 Permission denied
```

**Grace period**: 1-2 "Decryption failed" during container startup is normal (healthcheck probes). Alert if it persists >30 seconds.

**Prometheus Rules Configured:**

1. **Prometheus Alerting Rules** (`prometheus/rules/kms.yml`)
   - `KMSCryptoModeNotKMS` - Critical alert if crypto_mode != kms
   - `KMSCryptoNotReady` - Critical alert if crypto_ready != true
   - `KMSCryptoModeFlapping` - Warning if mode changes frequently
   - `KMSHighCryptoErrorRate` - Warning on sustained error rate
   - `KMSBackendRestarted` - Info alert on backend restart
   - `KMSHighLatency` - Warning if p95 latency > 1s
   - `KMSHealthChecksFailing` - Critical if health endpoint down 5+ min

2. **Ops Alert Rules** (`ops/alerts/kms.yml`)
   - Health endpoint monitoring (crypto_mode, crypto_ready)
   - Decryption error burst detection (with grace period)
   - Init failure detection
   - Persistent failure detection (10+ min threshold)
   - KMS service connectivity monitoring
   - Recording rules for dashboards

**Alert Thresholds:**
- Grace period: 120s after startup (allow healthcheck probes)
- Error burst: >10 errors in 5min (after grace period)
- Persistent: Error rate >0.01/s for 10min (after 5min grace)
- Health check: No success in 5min → critical

**Grafana Dashboard Metrics:**
- `kms:crypto_health_status` - Combined health indicator (0 or 1)
- `kms:decryption_error_rate_5m` - Rolling 5-minute error rate
- `kms:uptime_since_last_crypto_init` - Time since last crypto init

### CI/CD Integration

Add to your pipeline:

```yaml
# .github/workflows/deploy.yml
- name: Smoke Test - KMS Crypto
  run: |
    python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org --verbose
```

**Automated Workflows:**

1. **KMS Crypto Smoke Test** (`.github/workflows/kms-crypto-smoke.yml`)
   - Runs every 30 minutes on production
   - Runs on push to main
   - Runs on PR for crypto-related changes
   - Manual trigger available with custom URL

2. **Smoke Lite Integration** (`.github/workflows/smoke-lite.yml`)
   - KMS health check added to standard smoke tests
   - Runs on all PRs and merges
   - Non-blocking (warns if crypto not in KMS mode)

**Scripts Available:**
- `scripts/smoke-crypto-kms.py` - Python (cross-platform, for CI/CD)
- `scripts/smoke-crypto-kms.ps1` - PowerShell (for local Windows use)

**Usage Examples:**

```bash
# CI/CD (Linux)
python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org

# Local (Windows)
.\scripts\smoke-crypto-kms.ps1 -BaseUrl "https://api.ledger-mind.org"

# Local (Windows) - default localhost
.\scripts\smoke-crypto-kms.ps1
```

## 🔐 Security Best Practices

### IAM Least Privilege
✅ **Current**: `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the specific key
- ✅ Can encrypt/decrypt with the key
- ❌ Cannot delete/modify the key
- ❌ Cannot create new keys

### Secret Management
- ✅ Service account JSON mounted read-only: `/secrets/gcp-sa.json:ro`
- ✅ Not committed to git (`.gitignore`)
- ✅ Stored outside repository: `C:\secrets\`

### Network Security
- ✅ Backend uses stable Docker network aliases
- ✅ HTTPS enforced via Cloudflare tunnel
- ✅ API requires authentication

## 📊 Current State Snapshot

### Database (Oct 6, 2025 15:33:36 UTC)
```csv
id,label,kms_key_id,created_at
1,retired::20251006035932,,2025-10-06 03:59:17.57181+00
2,active-old-20251006-153336,,2025-10-06 03:59:32.011933+00
3,active,projects/ledgermind-03445-3l/locations/us-east1/keyRings/ledgermind/cryptoKeys/kek,2025-10-06 15:33:36.058971+00
```

- **Row 3** (active): KMS-wrapped, currently in use
- **Rows 1-2**: Legacy env-wrapped keys (retired, still readable)

### Verification Commands
```powershell
# Status
docker exec ai-finance-backend-1 python -m app.cli crypto-status
# Expected: {'label': 'active', 'mode': 'kms', 'wlen': 113, 'nlen': None}

# Health
Invoke-RestMethod http://localhost:8000/healthz | Select-Object crypto_mode, crypto_ready
# Expected: crypto_mode=kms, crypto_ready=True

# IAM
gcloud kms keys get-iam-policy kek `
  --keyring=ledgermind --location=us-east1 --project=ledgermind-03445-3l `
  --format="flattened(bindings[].role,bindings[].members[])"
# Expected: roles/cloudkms.cryptoKeyEncrypterDecrypter + service account
```

## 🆘 Troubleshooting

### Crypto Mode Falls Back to 'env'

**Symptoms**: `crypto_mode` shows `env` instead of `kms`

**Diagnosis**:
```powershell
# Check database
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "SELECT label, dek_wrap_nonce IS NULL as is_kms, kms_key_id FROM encryption_keys WHERE label='active';"
```

**Solution**: If `dek_wrap_nonce` is NOT NULL, the DEK is env-wrapped. Import KMS-wrapped key:
```powershell
docker exec ai-finance-backend-1 python -m app.cli crypto-import-active --force /app/active-dek.json
docker compose restart backend
```

### 403 Permission Denied

**Symptoms**: Logs show `403 Permission 'cloudkms.cryptoKeys.get' denied`

**Solution**:
```powershell
# Grant IAM role
gcloud kms keys add-iam-policy-binding kek `
  --keyring=ledgermind --location=us-east1 --project=ledgermind-03445-3l `
  --member="serviceAccount:ledgermind-backend@ledgermind-03445-3l.iam.gserviceaccount.com" `
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"

# Wait 2-7 minutes for propagation
Start-Sleep -Seconds 300
docker compose restart backend
```

### AAD Mismatch

**Symptoms**: `Decryption failed` or `AAD mismatch`

**Diagnosis**:
```powershell
# Check environment vs database
docker exec ai-finance-backend-1 python -c "
import os, json, pathlib
env_aad = os.getenv('GCP_KMS_AAD')
print(f'ENV AAD: {env_aad}')
"

# Check database (requires working crypto or manual inspection)
$dek = Get-Content apps/backend/active-dek.json | ConvertFrom-Json
Write-Host "DEK AAD: $($dek.aad)"
```

**Solution**: Ensure `GCP_KMS_AAD` environment variable matches exactly.

## 📚 Reference

### Related Files
- `docker-compose.yml`: Environment variables
- `apps/backend/active-dek.json`: KMS-wrapped key metadata (not committed)
- `scripts/smoke-crypto-kms.ps1`: Health check script (PowerShell, local use)
- `scripts/smoke-crypto-kms.py`: Health check script (Python, CI/CD use)
- `.github/workflows/kms-crypto-smoke.yml`: Automated smoke test workflow
- `prometheus/rules/kms.yml`: Prometheus alerting rules
- `ops/alerts/kms.yml`: Monitoring dashboard configuration
- `DOCKER_ALIASES.md`: Network configuration

### CLI Commands
```powershell
# Status
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Export (backup)
docker exec ai-finance-backend-1 python -m app.cli crypto-export-active active-dek-backup.json

# Import
docker exec ai-finance-backend-1 python -m app.cli crypto-import-active --force /app/active-dek.json

# Rewrap KEK
docker exec ai-finance-backend-1 python -m app.cli kek-rewrap-gcp

# New DEK
docker exec ai-finance-backend-1 python -m app.cli force-new-active-dek
```

---

**Last Updated**: October 6, 2025
**Status**: ✅ Operational
**Mode**: KMS (GCP Cloud KMS)
**Next Review**: Quarterly (January 2026)

---

## 📖 Runbook

Comprehensive troubleshooting procedures for KMS alerts. Alert names link to specific sections.

### Alert: KMSCryptoModeNotKMS

**Severity**: Critical
**Trigger**: `crypto_mode != 1` for 5+ minutes
**Impact**: System has fallen back to environment-based encryption (security regression)

**Diagnosis**:
```powershell
# Check current mode
docker exec ai-finance-backend-1 python -m app.cli crypto-status

# Check database key wrapping
docker exec ai-finance-postgres-1 psql -U myuser -d finance `
  -c "SELECT label, dek_wrap_nonce IS NULL as is_kms, kms_key_id FROM encryption_keys WHERE label='active';"

# Check backend logs
docker logs ai-finance-backend-1 --tail 100 | Select-String -Pattern "crypto|kms|init"
```

**Resolution**:
1. **If `dek_wrap_nonce` is NOT NULL** (env-wrapped key in database):
   ```powershell
   # Import KMS-wrapped key from backup
   docker exec ai-finance-backend-1 python -m app.cli crypto-import-active --force /app/active-dek.json
   docker compose restart backend
   ```

2. **If IAM permissions missing**:
   ```bash
   gcloud kms keys add-iam-policy-binding kek \
     --keyring=ledgermind --location=us-east1 --project=ledgermind-03445-3l \
     --member="serviceAccount:ledgermind-backend@ledgermind-03445-3l.iam.gserviceaccount.com" \
     --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
   # Wait 2-7 minutes for propagation
   sleep 300
   docker compose restart backend
   ```

3. **If service account JSON missing**:
   ```powershell
   # Verify mount
   docker exec ai-finance-backend-1 test -f /secrets/gcp-sa.json && echo "✅ File exists" || echo "❌ Missing"
   # Re-mount if needed (update docker-compose.yml volumes)
   ```

**Verification**:
```powershell
# Verify KMS mode restored
python scripts/smoke-crypto-kms.py --base-url http://localhost:8000
```

---

### Alert: KMSCryptoNotReady

**Severity**: Critical
**Trigger**: `crypto_ready != 1` for 5+ minutes
**Impact**: Cannot perform encryption/decryption operations

**Diagnosis**:
```powershell
# Check health
curl http://localhost:8000/healthz | jq .

# Check backend logs for init errors
docker logs ai-finance-backend-1 --tail 50 | Select-String -Pattern "crypto init|failed"

# Check database connectivity
docker exec ai-finance-backend-1 python -c "from app.database import get_db; next(get_db())"
```

**Resolution**:
1. **If crypto init failed**:
   ```powershell
   # Restart backend
   docker compose restart backend

   # Monitor startup
   docker logs -f ai-finance-backend-1
   ```

2. **If database connection issue**:
   ```powershell
   # Check postgres
   docker ps | Select-String postgres
   docker exec ai-finance-postgres-1 pg_isready -U myuser

   # Restart if needed
   docker compose restart postgres backend
   ```

3. **If DEK not found in database**:
   ```powershell
   # Import active DEK
   docker exec ai-finance-backend-1 python -m app.cli crypto-import-active --force /app/active-dek.json
   docker compose restart backend
   ```

**Verification**:
```powershell
python scripts/smoke-crypto-kms.py --base-url http://localhost:8000
```

---

### Alert: KMSCryptoModeFlapping

**Severity**: Warning
**Trigger**: crypto_mode changes >2 times in 1 hour
**Impact**: Instability in KMS connectivity or configuration

**Diagnosis**:
```powershell
# Check recent mode changes
curl http://localhost:9090/api/v1/query?query=changes(crypto_mode[1h])

# Check backend restarts
docker ps --filter "name=backend" --format "table {{.Status}}"

# Check GCP KMS service status
# Visit: https://status.cloud.google.com/
```

**Resolution**:
1. **If frequent backend restarts**:
   - Check for OOM kills: `docker logs ai-finance-backend-1 | Select-String -Pattern "killed|OOM"`
   - Check resource limits: `docker stats ai-finance-backend-1`
   - Increase memory limits if needed

2. **If network issues**:
   - Check internet connectivity from container
   - Verify firewall rules allow HTTPS to GCP
   - Check DNS resolution for `cloudkms.googleapis.com`

3. **If IAM propagation issues**:
   - Verify IAM policy is stable (not being changed repeatedly)
   - Wait 10 minutes after IAM changes before restarting

**Verification**:
Monitor for 1 hour to ensure mode remains stable.

---

### Alert: KMSHighCryptoErrorRate

**Severity**: Warning
**Trigger**: >0.1 decryption errors/sec for 5+ minutes
**Impact**: Degraded service, some operations failing

**Diagnosis**:
```powershell
# Check error details
docker logs ai-finance-backend-1 --tail 200 | Select-String -Pattern "Decryption failed|AAD mismatch|403"

# Check error rate
curl http://localhost:9090/api/v1/query?query=rate(crypto_decryption_errors_total[5m])

# Check affected operations
docker logs ai-finance-backend-1 --tail 100 | Select-String -Context 2 -Pattern "Decryption failed"
```

**Resolution**:
1. **If AAD mismatch**:
   ```powershell
   # Check AAD consistency
   docker exec ai-finance-backend-1 printenv GCP_KMS_AAD
   # Should be: app=ledgermind,env=dev

   # Compare with DEK AAD
   cat apps/backend/active-dek.json | jq .aad

   # If mismatch, update environment variable and restart
   ```

2. **If 403 Permission denied**:
   ```bash
   # Verify IAM policy
   gcloud kms keys get-iam-policy kek \
     --keyring=ledgermind --location=us-east1 --project=ledgermind-03445-3l

   # Re-grant if needed (see KMSCryptoModeNotKMS)
   ```

3. **If corrupted data**:
   ```powershell
   # Identify corrupted records
   docker logs ai-finance-backend-1 | Select-String -Pattern "Decryption failed" | Select-Object -Last 10

   # May need to re-encrypt affected data (contact DBA)
   ```

**Verification**:
```powershell
# Error rate should drop to near-zero
curl http://localhost:9090/api/v1/query?query=rate(crypto_decryption_errors_total[5m])
```

---

### Alert: KMSHealthChecksFailing

**Severity**: Critical
**Trigger**: No successful health checks for 5+ minutes
**Impact**: Backend may be down or unresponsive

**Diagnosis**:
```powershell
# Check if backend is running
docker ps | Select-String backend

# Check backend health directly
curl http://localhost:8000/healthz

# Check backend logs
docker logs ai-finance-backend-1 --tail 100

# Check resource usage
docker stats ai-finance-backend-1 --no-stream
```

**Resolution**:
1. **If container crashed**:
   ```powershell
   # Check exit code
   docker ps -a | Select-String backend

   # Check logs for crash reason
   docker logs ai-finance-backend-1 --tail 200

   # Restart
   docker compose restart backend
   ```

2. **If OOM (Out of Memory)**:
   ```powershell
   # Check logs
   docker logs ai-finance-backend-1 | Select-String -Pattern "killed|OOM"

   # Increase memory limit in docker-compose.yml
   # deploy:
   #   resources:
   #     limits:
   #       memory: 2G

   docker compose up -d backend
   ```

3. **If deadlock/hang**:
   ```powershell
   # Send SIGTERM and wait
   docker stop ai-finance-backend-1 -t 30

   # Force kill if needed
   docker kill ai-finance-backend-1

   # Restart
   docker compose up -d backend
   ```

**Verification**:
```powershell
# Wait for startup (30-60 seconds)
sleep 60
curl http://localhost:8000/healthz
```

---

### Alert: KMSHighLatency

**Severity**: Warning
**Trigger**: p95 KMS operation latency >1s for 10+ minutes
**Impact**: Slow response times, degraded user experience

**Diagnosis**:
```powershell
# Check GCP KMS service status
# Visit: https://status.cloud.google.com/

# Check network latency to GCP
Test-NetConnection cloudkms.googleapis.com -Port 443

# Check backend resource usage
docker stats ai-finance-backend-1 --no-stream

# Check operation latency distribution
curl http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,rate(kms_operation_duration_seconds_bucket[5m]))
```

**Resolution**:
1. **If GCP service degradation**:
   - Monitor GCP status page
   - Consider temporary fallback plan (if available)
   - Wait for resolution

2. **If network issues**:
   - Check firewall rules
   - Check DNS resolution speed
   - Consider VPC peering for lower latency (long-term)

3. **If backend resource constrained**:
   - Scale up backend instances
   - Increase CPU/memory limits
   - Review query performance

**Verification**:
Monitor latency for 15 minutes to ensure improvement.

---

### Alert: KMSDecryptionErrorsBurst

**Severity**: Warning
**Trigger**: >10 decryption errors in 5 minutes (after 2min grace period)
**Impact**: Multiple operations failing, possible data corruption

**Diagnosis**:
```powershell
# Get error timestamps
docker logs ai-finance-backend-1 --since 10m | Select-String -Pattern "Decryption failed" | Select-Object -First 20

# Check if burst is during startup
docker ps --filter "name=backend" --format "table {{.Status}}"

# Check for pattern (specific table/column)
docker logs ai-finance-backend-1 | Select-String -Context 5 -Pattern "Decryption failed"
```

**Resolution**:
1. **If during startup** (grace period):
   - Normal behavior (healthcheck probes)
   - Wait 2-3 minutes
   - Alert should auto-resolve

2. **If specific data affected**:
   - Identify affected records from logs
   - Check if DEK rotation happened recently
   - Verify old DEKs are still in database and readable

3. **If widespread**:
   - Follow KMSHighCryptoErrorRate runbook
   - Check for recent configuration changes
   - Consider restoring from backup if corruption detected

**Verification**:
```powershell
# Check error count dropped
curl http://localhost:9090/api/v1/query?query=increase(crypto_decryption_errors_total[5m])
```

---

### General Troubleshooting Tips

1. **Check order**:
   - Service status (docker ps)
   - Health endpoint (/healthz)
   - Backend logs (docker logs)
   - Prometheus metrics
   - GCP KMS service status

2. **Common fixes**:
   - Restart backend: `docker compose restart backend`
   - Verify IAM: Check permissions not revoked
   - Check service account: Verify JSON file mounted
   - Network check: Test connectivity to cloudkms.googleapis.com

3. **Emergency contacts**:
   - On-call engineer: oncall@ledger-mind.org
   - Security team: secops@ledger-mind.org
   - GCP support: https://console.cloud.google.com/support

4. **Escalation criteria**:
   - Multiple critical alerts firing simultaneously
   - Data corruption suspected
   - Unable to restore KMS mode after 30 minutes
   - GCP-wide outage affecting KMS

---
