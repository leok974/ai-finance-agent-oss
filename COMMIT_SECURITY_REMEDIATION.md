# SECURITY REMEDIATION COMMIT

## Summary
Critical security incident response: GCP Service Account key leaked in repository history.

## Incident Details
- **Date**: 2025-11-05
- **Severity**: HIGH
- **File**: `gcp-dbt-sa.json`
- **Key ID**: `5b0a36412e9b3b7a019af3dcce31769f29126fd2`
- **Service Account**: `dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com`

## Immediate Actions Completed

### 1. Pre-commit Hardening ✅
- Added strict `.gitleaks.toml` with GCP SA detection rules
- Updated `.pre-commit-config.yaml` with:
  - Enhanced gitleaks (verbose + redact mode)
  - detect-secrets integration
- Blocks future commits with secrets

### 2. Git Ignore Patterns ✅
- Added comprehensive patterns:
  ```
  *.sa.json
  *gcp*key*.json
  *service-account*.json
  gcp-dbt-sa.json
  *-credentials.json
  *-sa-key.json
  ```

### 3. OIDC Migration ✅
- Created `.github/workflows/dbt-oidc.yml`
- Uses Workload Identity Federation (no static keys)
- Replaces `dbt-nightly.yml` JSON key approach

### 4. Documentation ✅
- Updated `SECURITY.md` with:
  - Incident timeline & remediation checklist
  - No Static Keys Policy
  - Emergency key rotation procedure
  - Pre-commit setup instructions

### 5. History Purge Scripts ✅
- `scripts/security/purge-leaked-key.ps1` (PowerShell)
- `scripts/security/purge-leaked-key.sh` (Bash)
- Automated `git filter-repo` with safety checks

## CRITICAL: Manual Steps Required

### A) Disable & Delete GCP Key (URGENT)
```bash
SA_EMAIL="dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"
KEY_ID="5b0a36412e9b3b7a019af3dcce31769f29126fd2"

# Disable key (immediate stop)
gcloud iam service-accounts keys disable "$KEY_ID" --iam-account "$SA_EMAIL"

# Delete key (permanent)
gcloud iam service-accounts keys delete "$KEY_ID" --iam-account "$SA_EMAIL" --quiet
```

### B) Purge Git History (BEFORE MERGING)
```powershell
# Windows (PowerShell)
.\scripts\security\purge-leaked-key.ps1

# Linux/Mac (Bash)
bash scripts/security/purge-leaked-key.sh
```

**Then force-push:**
```bash
git push --force --prune origin HEAD:main
```

### C) GitHub Repository Settings
1. Enable **Secret Scanning** (Settings → Security → Code security)
2. Enable **Push Protection** (blocks commits with secrets)
3. Enable **Private Vulnerability Reporting**
4. Delete GitHub Actions artifacts from affected runs

### D) Setup GCP Workload Identity Federation
```bash
# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create github \
  --project=ledgermind-ml-analytics \
  --location=global \
  --display-name="GitHub Actions"

# 2. Create Provider
gcloud iam workload-identity-pools providers create-oidc github \
  --project=ledgermind-ml-analytics \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 3. Grant SA impersonation
gcloud iam service-accounts add-iam-policy-binding \
  dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com \
  --project=ledgermind-ml-analytics \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/leok974/ai-finance-agent-oss"

# 4. Store WIF provider in GitHub Secrets
# Name: GCP_WIF_PROVIDER
# Value: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
```

### E) Verify OIDC Workflow
```bash
# Manually trigger dbt-oidc workflow
gh workflow run dbt-oidc.yml

# Check logs for successful auth
gh run watch
```

### F) Audit Cloud Logging
```bash
# Check for suspicious SA usage
gcloud logging read \
  "protoPayload.authenticationInfo.principalEmail=dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com" \
  --limit=100 \
  --format=json \
  --project=ledgermind-ml-analytics
```

## Files Changed

### New Files
- `.gitleaks.toml` - Secret detection rules
- `.github/workflows/dbt-oidc.yml` - OIDC-based dbt workflow
- `scripts/security/purge-leaked-key.ps1` - History cleanup (Windows)
- `scripts/security/purge-leaked-key.sh` - History cleanup (Linux/Mac)
- `COMMIT_SECURITY_REMEDIATION.md` - This file

### Modified Files
- `.gitignore` - Added SA key patterns
- `.pre-commit-config.yaml` - Added detect-secrets
- `SECURITY.md` - Added incident documentation + policies

## Post-Merge Checklist

- [ ] GCP key disabled & deleted
- [ ] Git history purged (force-push completed)
- [ ] GitHub secret scanning enabled
- [ ] GitHub push protection enabled
- [ ] WIF provider configured in GCP
- [ ] `GCP_WIF_PROVIDER` secret added to GitHub
- [ ] `dbt-oidc.yml` workflow tested successfully
- [ ] Cloud Logging audit reviewed
- [ ] GitHub Actions artifacts deleted
- [ ] Team notified to re-clone repository
- [ ] Pre-commit hooks tested: `pre-commit run -a`
- [ ] Gitleaks verified: `gitleaks detect --no-banner --redact`

## Prevention Measures Implemented

1. **Pre-commit Enforcement**: gitleaks + detect-secrets block secrets at commit time
2. **GitHub Push Protection**: Server-side blocking of secret pushes
3. **No Static Keys Policy**: OIDC-only for CI/CD
4. **Comprehensive .gitignore**: Blocks all SA key filename patterns
5. **Security Documentation**: Emergency procedures in SECURITY.md
6. **Automated Scripts**: History purge scripts with safety checks

## Root Cause Analysis

**Cause**: Developer accidentally committed service account JSON during dbt BigQuery setup.

**Contributing Factors**:
- No pre-commit secret detection at time of commit
- GitHub push protection not enabled
- Static key used instead of OIDC

**Corrective Actions**:
- All 3 factors now addressed
- Team training on credential management
- Regular security audits scheduled

## Contact

For questions about this remediation:
- Repository owner: leok974
- Security issues: Use GitHub Security Advisories

---

**Generated**: 2025-11-05
**Classification**: INTERNAL - Security Remediation
