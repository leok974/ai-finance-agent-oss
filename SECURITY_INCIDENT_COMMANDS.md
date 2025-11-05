# Security Incident Remediation - Final Command Reference

## PR Created
**URL**: https://github.com/leok974/ai-finance-agent-oss/pull/3
**Title**: Security: Remove leaked key from history, enforce OIDC, harden scanning
**Branch**: `sec/finish-key-incident` → `main`

---

## ⚠️ CRITICAL: Execute These Commands Immediately

### Step 1: Disable & Delete GCP Key (URGENT)

#### PowerShell
```powershell
$SA = "dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"
$KEY = "5b0a36412e9b3b7a019af3dcce31769f29126fd2"

# Disable key immediately (stops all authentication)
gcloud iam service-accounts keys disable $KEY --iam-account $SA

# Delete key permanently
gcloud iam service-accounts keys delete $KEY --iam-account $SA --quiet

# Verify deletion
gcloud iam service-accounts keys list --iam-account $SA --filter="name:$KEY"
# Expected: Empty result (key gone)
```

#### Bash
```bash
SA="dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"
KEY="5b0a36412e9b3b7a019af3dcce31769f29126fd2"

# Disable key
gcloud iam service-accounts keys disable "$KEY" --iam-account "$SA"

# Delete key
gcloud iam service-accounts keys delete "$KEY" --iam-account "$SA" --quiet

# Verify
gcloud iam service-accounts keys list --iam-account "$SA" --filter="name:$KEY"
```

---

### Step 2: Purge Git History (BEFORE merging PR #3)

#### Prerequisites
```bash
# Install git-filter-repo
pip install git-filter-repo

# Ensure working directory is clean
git status
# Should show: "nothing to commit, working tree clean"
```

#### Execute Purge (PowerShell)
```powershell
# Navigate to repo root
cd C:\ai-finance-agent-oss-clean

# Run automated purge script
.\scripts\security\history-purge.ps1

# Script will:
# 1. Check for uncommitted changes (abort if dirty)
# 2. Create backup branch: backup-before-filter-repo-YYYYMMDD-HHMMSS
# 3. Verify git-filter-repo installed
# 4. Confirm file exists in history
# 5. Prompt for confirmation (type 'YES')
# 6. Run: python -m git_filter_repo --invert-paths --path gcp-dbt-sa.json --force
# 7. Verify removal
# 8. Show next steps
```

#### Execute Purge (Bash)
```bash
# Navigate to repo root
cd /path/to/ai-finance-agent-oss-clean

# Run automated purge script
bash scripts/security/history-purge.sh

# Same workflow as PowerShell version
```

#### Manual Purge (if scripts fail)
```bash
# Backup first
git branch backup-manual-$(date +%Y%m%d-%H%M%S)

# Run filter-repo
python -m git_filter_repo --invert-paths --path gcp-dbt-sa.json --force

# Verify
git log --all --full-history -- gcp-dbt-sa.json
# Should return: fatal: ambiguous argument (file not found)
```

---

### Step 3: Force Push (AFTER purge succeeds)

#### PowerShell
```powershell
# Verify remote configuration
git remote -v
# Expected: origin  https://github.com/leok974/ai-finance-agent-oss.git

# Force push to main
git push --force --prune origin HEAD:main

# Force push to all branches (ensures completeness)
git push --force --all origin
git push --force --tags origin

# Verify on GitHub
# Navigate to: https://github.com/leok974/ai-finance-agent-oss/commits/main
# Confirm: gcp-dbt-sa.json absent from all commits
```

#### Bash
```bash
# Same commands work in bash
git push --force --prune origin HEAD:main
git push --force --all origin
git push --force --tags origin
```

---

### Step 4: Enable GitHub Secret Scanning (Manual UI)

#### Navigate to Repository Settings
1. Go to: https://github.com/leok974/ai-finance-agent-oss/settings/security_analysis
2. Under "Code security and analysis":
   - Click **Enable** for "Secret scanning"
   - Click **Enable** for "Push protection"
   - Click **Enable** for "Private vulnerability reporting"
3. Verify enabled status (green checkmarks)

#### Test Push Protection
```bash
# Create test file with fake secret
git checkout -b test/push-protection
echo '{"type":"service_account","private_key":"fake"}' > test-sa.json
git add test-sa.json
git commit -m "test" --no-verify  # bypass pre-commit

# Try to push (should be BLOCKED by GitHub)
git push origin test/push-protection
# Expected: "Push blocked: secret detected by push protection"

# Cleanup
git checkout main
git branch -D test/push-protection
rm test-sa.json
```

---

### Step 5: Create GitHub Repository Rulesets (Manual UI)

#### Navigate to Rulesets
1. Go to: https://github.com/leok974/ai-finance-agent-oss/settings/rules
2. Click "New ruleset" → "New branch ruleset"

#### Ruleset 1: Block GCP Service Account Keys
- **Name**: `Block GCP Service Account Keys`
- **Enforcement**: Active
- **Target branches**: All branches (default)
- **Rules**:
  - Enable "Restrict file paths"
  - Add restricted file paths:
    - `.*service[-_ ]?account.*\.json`
    - `.*gcp.*key.*\.json`
    - `.*[-_]sa\.json`
    - `gcp-dbt-sa\.json`
  - Bypass list (optional):
    - `tests/fixtures/.*`
    - `.*\.example\.json`
- Click "Create"

#### Ruleset 2: Security Review Required
- **Name**: `Security Review Required`
- **Enforcement**: Active
- **Target branches**: `main`
- **Rules**:
  - Enable "Require pull request"
    - Required approvals: 1
    - Require review from Code Owners: ✅
  - Enable "Restrict file paths"
  - Add restricted file paths:
    - `/ops/**/*.json`
    - `/scripts/security/**`
    - `/.github/workflows/**`
    - `/.gitleaks.toml`
    - `/SECURITY.md`
- Click "Create"

**Complete guide**: See `docs/security/ruleset.md` in the PR

---

### Step 6: Setup GCP Workload Identity Federation (Post-merge)

#### Get Project Number
```bash
PROJECT_ID="ledgermind-ml-analytics"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project Number: $PROJECT_NUMBER"
```

#### Create Workload Identity Pool
```bash
gcloud iam workload-identity-pools create github \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions" \
  --description="OIDC provider for GitHub Actions workflows"
```

#### Create OIDC Provider
```bash
gcloud iam workload-identity-pools providers create-oidc github \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'leok974'"
```

#### Grant Service Account Impersonation
```bash
SA_EMAIL="dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"
REPO="leok974/ai-finance-agent-oss"

gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --project=$PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

#### Get WIF Provider Resource Name
```bash
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
echo "WIF Provider (add to GitHub Secrets):"
echo $WIF_PROVIDER
```

#### Add to GitHub Secrets
```bash
# Option 1: GitHub CLI
gh secret set GCP_WIF_PROVIDER --body "$WIF_PROVIDER"

# Option 2: Manual UI
# Navigate to: https://github.com/leok974/ai-finance-agent-oss/settings/secrets/actions
# Click "New repository secret"
# Name: GCP_WIF_PROVIDER
# Value: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
```

---

### Step 7: Test OIDC Workflow

#### Trigger Workflow
```bash
# Manual dispatch via CLI
gh workflow run dbt-oidc.yml

# Manual dispatch via UI
# Navigate to: https://github.com/leok974/ai-finance-agent-oss/actions/workflows/dbt-oidc.yml
# Click "Run workflow" → "Run workflow"
```

#### Watch Logs
```bash
# Follow latest run
gh run watch

# View specific run
gh run view $(gh run list --workflow=dbt-oidc.yml --limit=1 --json databaseId --jq '.[0].databaseId')

# Check authentication step
gh run view --log | grep "Authenticated as"
# Expected: "✅ Authenticated as: dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"
```

#### Verify Success
```bash
# List recent runs
gh run list --workflow=dbt-oidc.yml --limit=5

# Expected status: ✓ completed (green checkmark)
```

---

### Step 8: Verification Commands

#### Verify History Purge
```bash
# Check if file exists in any commit
git log --all --oneline | Select-String "gcp-dbt-sa.json"
# Expected: No matches

git log --all --full-history -- gcp-dbt-sa.json
# Expected: fatal: ambiguous argument (file not found)

# Check current HEAD
git ls-tree -r HEAD --name-only | Select-String "gcp-dbt-sa"
# Expected: No matches
```

#### Run Gitleaks Scan
```bash
# Scan entire repository + history
gitleaks detect --no-banner --redact -v --log-level=debug

# Expected output:
# "No leaks found"
# Exit code: 0
```

#### Run detect-secrets Scan
```bash
# Generate new baseline (optional - updates .secrets.baseline)
detect-secrets scan > .secrets.baseline.new

# Audit baseline
detect-secrets audit .secrets.baseline.new

# Compare with existing
diff .secrets.baseline .secrets.baseline.new

# If clean, replace
mv .secrets.baseline.new .secrets.baseline
git add .secrets.baseline
git commit -m "chore: update detect-secrets baseline after history purge"
```

#### Run Pre-commit Hooks
```bash
# Run all hooks on all files
pre-commit run -a

# Expected output:
# black..........................................................Passed
# ruff (legacy alias)........................................Passed
# block wrapped key exports and service accounts.............Passed
# Help Panels Why Validator..................................Passed ✅
# Detect hardcoded secrets...................................Passed
# Detect secrets.............................................Passed
```

#### Check Repository Size
```bash
# Before and after comparison
git count-objects -vH

# Expected: size-pack should be smaller after purge
```

---

### Step 9: Audit Cloud Logging (GCP)

#### Check for Suspicious SA Usage
```bash
SA_EMAIL="dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com"

# Last 100 auth events
gcloud logging read \
  "protoPayload.authenticationInfo.principalEmail=\"$SA_EMAIL\"" \
  --limit=100 \
  --format=json \
  --project=ledgermind-ml-analytics \
  > sa-audit-$(date +%Y%m%d).json

# Filter for external IPs (potential unauthorized access)
cat sa-audit-$(date +%Y%m%d).json | jq '.[] | select(.protoPayload.requestMetadata.callerIp != null) | {timestamp: .timestamp, ip: .protoPayload.requestMetadata.callerIp, resource: .protoPayload.resourceName}'

# Check for unusual times (outside CI schedule: 3 AM UTC daily)
cat sa-audit-$(date +%Y%m%d).json | jq '.[] | {timestamp: .timestamp, method: .protoPayload.methodName}'
```

#### Check for Key Usage (Before Deletion)
```bash
KEY_ID="5b0a36412e9b3b7a019af3dcce31769f29126fd2"

# Last 30 days of key usage
gcloud logging read \
  "protoPayload.authenticationInfo.principalEmail=\"$SA_EMAIL\" AND protoPayload.authenticationInfo.serviceAccountKeyName:\"$KEY_ID\"" \
  --limit=1000 \
  --format=json \
  --project=ledgermind-ml-analytics \
  --freshness=30d \
  > key-usage-audit.json

# Count events per day
cat key-usage-audit.json | jq -r '.[] | .timestamp[:10]' | sort | uniq -c

# If any usage found AFTER key was disabled → investigate immediately
```

---

### Step 10: Team Notification

#### Message to Send
```
🚨 CRITICAL: Repository History Rewritten - Action Required

Team,

We've completed a security remediation for a leaked GCP service account key.
Git history has been rewritten to remove the exposed credential.

ACTION REQUIRED BY ALL DEVELOPERS:
1. Save/commit any local work
2. DELETE your local clone of ai-finance-agent-oss
3. Fresh clone: git clone https://github.com/leok974/ai-finance-agent-oss.git
4. DO NOT push old branches (they contain the leaked key)

Timeline:
- Incident: 2025-11-05
- Remediation: [TODAY'S DATE]
- Affected file: gcp-dbt-sa.json (removed from all commits)
- GCP key: DISABLED and DELETED

Prevention:
- Pre-commit hooks now block secrets
- GitHub push protection enabled
- OIDC-only authentication enforced

Questions? See COMMIT_SECURITY_REMEDIATION.md or contact @leok974

Thank you for your cooperation.
```

#### Channels to Notify
- Slack/Discord development channel
- Email to all contributors
- GitHub Discussions post (if applicable)
- Pin message in chat until all confirm re-clone

---

## 📋 Complete Checklist

### Pre-Merge (Do Now)
- [ ] Step 1: GCP key disabled & deleted ✅
- [ ] Step 2: Git history purged locally
- [ ] Step 3: Force-pushed to remote
- [ ] Step 4: Secret scanning enabled (GitHub UI)
- [ ] Step 5: Repository rulesets created (GitHub UI)
- [ ] Verified: `git log --all -- gcp-dbt-sa.json` returns nothing
- [ ] Verified: `gitleaks detect` shows no leaks

### Post-Merge (After PR #3 merged)
- [ ] Step 6: GCP WIF configured
- [ ] Step 7: OIDC workflow tested successfully
- [ ] Step 8: All verification commands passed
- [ ] Step 9: Cloud Logging audit reviewed (no unauthorized usage)
- [ ] Step 10: Team notified to re-clone

### Cleanup
- [ ] Delete backup branches: `git branch -D backup-*`
- [ ] Delete GitHub Actions artifacts (Manual UI)
- [ ] Update SECURITY.md with resolution date
- [ ] Close this incident in project tracking

---

## 🔗 References

- **PR**: https://github.com/leok974/ai-finance-agent-oss/pull/3
- **Incident Doc**: `COMMIT_SECURITY_REMEDIATION.md`
- **Ruleset Guide**: `docs/security/ruleset.md`
- **CODEOWNERS**: `.github/CODEOWNERS`
- **Purge Scripts**: `scripts/security/history-purge.{ps1,sh}`

---

## 🆘 Troubleshooting

### Issue: git-filter-repo not found
```bash
pip install git-filter-repo
# or
pip3 install git-filter-repo
```

### Issue: Force push rejected
```bash
# Ensure you have write permissions
gh auth status

# Force push again (may need to disable branch protection temporarily)
git push --force origin HEAD:main
```

### Issue: OIDC workflow fails with "Workload Identity Pool not found"
```bash
# Verify WIF provider exists
gcloud iam workload-identity-pools providers describe github \
  --workload-identity-pool=github \
  --location=global \
  --project=ledgermind-ml-analytics

# Verify secret is correct
gh secret list | grep GCP_WIF_PROVIDER
```

### Issue: Gitleaks still detects the key after purge
```bash
# Clear gitleaks cache
rm -rf .git/gitleaks-cache

# Re-run scan
gitleaks detect --no-banner --redact -v
```

### Issue: Team member pushed old branch after history rewrite
```bash
# Force reset that branch on remote
git push --force origin :old-branch-name

# Notify developer to delete local clone and re-clone
```

---

**Generated**: 2025-11-05
**Last Updated**: [CURRENT DATE/TIME]
**Status**: Phase 1 Complete, Phases 2-5 In Progress
