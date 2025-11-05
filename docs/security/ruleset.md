# GitHub Repository Ruleset Configuration

## Purpose
Prevent accidental commits of GCP service account keys and other sensitive credentials.

## Required Rulesets

### 1. Block Service Account JSON Files

**Navigate to**: Settings → Rules → Rulesets → New ruleset

**Ruleset Name**: `Block GCP Service Account Keys`

**Target branches**: `All branches`

**Rules**:
- **Block file path patterns** (add each separately):
  - Pattern: `.*service[-_ ]?account.*\.json`
    - Description: Block any JSON files with "service-account" or "service_account" in the name
  - Pattern: `.*gcp.*key.*\.json`
    - Description: Block GCP key files
  - Pattern: `.*[-_]sa\.json`
    - Description: Block files ending in -sa.json or _sa.json
  - Pattern: `gcp-dbt-sa\.json`
    - Description: Block the specific leaked file

**Bypass list**:
- Pattern: `tests/fixtures/.*`
  - Description: Allow test fixtures
- Pattern: `.*\.example\.json`
  - Description: Allow example/template files

### 2. Require Code Review for Sensitive Paths

**Ruleset Name**: `Security Review Required`

**Target branches**: `main`, `production`, `release/*`

**Rules**:
- **Require pull request before merging**
  - Required approvals: 1
  - Require review from Code Owners: ✅
  - Dismiss stale pull request approvals: ✅

**Applies to files matching**:
- `/ops/**/*.json`
- `/dbt/**/*.json`
- `/infra/**/*.json`
- `**/.env*`
- `**/credentials*.json`
- `/scripts/security/**`
- `/.github/workflows/**`
- `/.gitleaks.toml`
- `/SECURITY.md`

### 3. Enable Secret Scanning

**Navigate to**: Settings → Code security and analysis

**Enable**:
- ✅ **Secret scanning** - Detect secrets in your code
- ✅ **Push protection** - Block pushes that contain secrets
- ✅ **Private vulnerability reporting** - Allow security researchers to privately report vulnerabilities

### 4. Branch Protection Rules

**Navigate to**: Settings → Branches → Add branch protection rule

**Branch name pattern**: `main`

**Protection rules**:
- ✅ Require a pull request before merging
  - Require approvals: 1
- ✅ Require status checks to pass before merging
  - Require branches to be up to date before merging: ✅
  - Status checks:
    - `pre-commit` (if you have a CI check for this)
    - `gitleaks`
    - `web tests (coverage)`
    - `backend: test (hermetic)`
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings

## Manual Configuration Steps

### Step 1: Enable Secret Scanning
```bash
# Navigate in GitHub UI:
# Repository → Settings → Code security and analysis → Secret scanning
# Click "Enable" for:
# - Secret scanning
# - Push protection
```

### Step 2: Create File Path Block Ruleset
```bash
# Navigate in GitHub UI:
# Repository → Settings → Rules → Rulesets → New ruleset
#
# Name: Block GCP Service Account Keys
# Target: All branches
#
# Add rule: "Block file path patterns"
# Pattern 1: .*service[-_ ]?account.*\.json
# Pattern 2: .*gcp.*key.*\.json
# Pattern 3: .*[-_]sa\.json
# Pattern 4: gcp-dbt-sa\.json
#
# Bypass patterns:
# - tests/fixtures/.*
# - .*\.example\.json
```

### Step 3: Configure CODEOWNERS
CODEOWNERS file already created at `.github/CODEOWNERS`

This will require review from `@leok974` for:
- All JSON files in `/ops`, `/dbt`, `/infra`, `/warehouse`
- Security scripts and workflows
- Credential and environment files

### Step 4: Verify Configuration
After setup, test with:
```bash
# Try to commit a fake SA key (should be blocked by pre-commit)
echo '{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----"}' > test-sa.json
git add test-sa.json
git commit -m "test"
# Should fail at gitleaks hook

# Clean up
git reset HEAD test-sa.json
rm test-sa.json
```

## Enforcement Timeline

- **Pre-commit hooks**: ✅ Active now (gitleaks + detect-secrets)
- **CODEOWNERS**: ✅ Active after PR merge
- **Rulesets**: ⏳ Requires manual GitHub UI configuration
- **Secret scanning**: ⏳ Requires manual GitHub UI configuration

## References

- [GitHub Rulesets Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Secret Scanning Documentation](https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning)
- [CODEOWNERS Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

## Emergency Override

If you need to bypass these rules in a legitimate emergency:
1. Create a branch with `bypass/` prefix (if configured)
2. Or temporarily disable the ruleset in Settings → Rules
3. Document the reason in the commit message
4. Re-enable immediately after the emergency commit
5. Create a follow-up issue to review the emergency change
