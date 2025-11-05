# Pre-commit Quick Start

## One-Time Setup

```bash
# Install pre-commit
pip install pre-commit

# Install git hooks (run from repo root)
cd C:\ai-finance-agent-oss-clean
pre-commit install

# Optional: Run on all existing files to normalize
pre-commit run --all-files
```

Or use the Makefile:

```bash
make precommit-install
make precommit-run
```

## What Gets Validated

### ✅ Python Code (Black + Ruff)
- Auto-formats with Black
- Lints and fixes with Ruff

### ✅ JSON Files
- Validates syntax
- Fixes trailing whitespace
- Ensures newline at end of file

### ✅ Grafana Dashboards (ML only)
**Files**: `ops/grafana/**/*ml*.json`, `*ml_suggestions*.json`

**Automated checks**:
- JSON formatting (2-space indent, preserved field order)
- JQ validation (structure integrity)
- **ML dashboard requirements** (custom validator):
  - Contains `$prom` datasource variable
  - Contains required metrics:
    - `lm_ml_train_val_f1_macro`
    - `lm_ml_predict_requests_total`
    - `lm_suggest_compare_total`

**Note**: Non-ML dashboards are automatically skipped by the validator.

### ✅ Docker Compose
- Validates `docker-compose*.yml` files

### ✅ Secrets Protection
- Blocks service account keys
- Blocks wrapped key exports

### ✅ Git Secrets
- Scans for leaked credentials (gitleaks)

## Manual Validation

### Validate Grafana Dashboards

```powershell
# All dashboards
.\scripts\validate-dashboards.ps1

# Specific file
.\scripts\validate-dashboards.ps1 -Files "ops\grafana\dashboards\ml-suggestions.json"

# Strict mode (exit with error code)
.\scripts\validate-dashboards.ps1 -Strict
```

Or use Python directly:

```bash
python scripts/validate_grafana_dashboard.py ops/grafana/dashboards/ml-suggestions.json
```

### Output Examples

**✅ Valid ML Dashboard:**
```
[ops\grafana\dashboards\ml-suggestions.json] ✅ Grafana ML dashboard looks good.
```

**⏭️ Non-ML Dashboard (skipped):**
```
[ops\grafana\dashboards\ingest-health.json] ⏭️ Skipped (non-ML dashboard)
```

**❌ Invalid ML Dashboard:**
```
[ops\grafana\test.json] ❌ Missing Grafana datasource variable `$prom` in templating.list
[ops\grafana\test.json] ❌ Dashboard panels missing required metrics: lm_ml_train_val_f1_macro
```

## Workflow

### Normal Commits (hooks run automatically)

```bash
# Stage files
git add ops/grafana/dashboards/ml-suggestions.json

# Commit (pre-commit runs automatically)
git commit -m "Update ML dashboard"
```

If validation fails, the commit is blocked:

```
Validate Grafana ML dashboard....................................Failed
- hook id: grafana-dashboard-validate
- exit code: 1

[ops\grafana\dashboards\ml-suggestions.json] ❌ Dashboard panels missing required metrics: lm_ml_predict_requests_total
```

Fix the issues and retry:

```bash
# Fix the dashboard
# ...

# Stage and commit again
git add ops/grafana/dashboards/ml-suggestions.json
git commit -m "Update ML dashboard"
```

### Bypass Hooks (emergency only)

```bash
# Skip all hooks
git commit --no-verify -m "Emergency fix"

# Skip specific hook
SKIP=grafana-dashboard-validate git commit -m "WIP: dashboard"
```

## CI/CD Integration

### GitHub Actions Workflows

**1. Pre-commit validation on PRs** (`.github/workflows/pre-commit.yml`)

Runs automatically on:
- Pull requests
- Pushes to `main` branch

```yaml
# Validates on changed files only (fast)
# Falls back to all files if needed
- name: Run pre-commit
  run: pre-commit run --from-ref origin/${{ github.base_ref }} --to-ref HEAD
```

**2. Auto-update hooks monthly** (`.github/workflows/pre-commit-autoupdate.yml`)

Runs automatically on:
- 1st of every month at 7 AM UTC
- Manual workflow dispatch

Creates a PR with updated hook versions automatically.

### Add to Custom Workflows

```yaml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for --from-ref
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install pre-commit
        run: pip install pre-commit
      
      - name: Install jq
        run: sudo apt-get update && sudo apt-get install -y jq
      
      - name: Run pre-commit
        run: pre-commit run --all-files --show-diff-on-failure
```

### CI Behavior

When a PR is opened:

1. ✅ **Fast validation**: Runs only on changed files
2. ⚠️ **Fallback**: If that fails, runs on all files
3. ❌ **Blocks merge**: PR cannot be merged if validation fails
4. 📝 **Shows diffs**: Displays exact formatting/validation issues

**Example CI output:**
```
Validate Grafana ML dashboard ($prom + required queries).................Failed
- hook id: grafana-dashboard-validate
- exit code: 1

[ops/grafana/dashboards/ml-suggestions.json] ❌ Dashboard panels missing required metrics: lm_ml_predict_requests_total
```

## Troubleshooting

### Pre-commit not found

```bash
# Install globally
pip install pre-commit

# Or with pipx
pipx install pre-commit
```

### Hooks not running

```bash
# Reinstall hooks
pre-commit uninstall
pre-commit install

# Verify installation
pre-commit run --all-files
```

### Dashboard validation too strict

If you need to commit a dashboard that doesn't meet ML requirements:

**Option 1**: Rename the file to not include "ml", "suggest", "predict", or "train" (validator will skip it)

**Option 2**: Skip the hook temporarily:
```bash
SKIP=grafana-dashboard-validate git commit -m "WIP: dashboard"
```

**Option 3**: Update the validator script to adjust requirements:
```python
# scripts/validate_grafana_dashboard.py
REQUIRED_METRICS = [
    "lm_ml_train_val_f1_macro",
    # "lm_ml_predict_requests_total",  # Comment out to skip
    "lm_suggest_compare_total",
]
```

### Update hook versions

```bash
# Update to latest hook versions
pre-commit autoupdate

# Commit the updated config
git add .pre-commit-config.yaml
git commit -m "chore: update pre-commit hooks"
```

## Files Reference

| File | Purpose |
|------|---------|
| `.pre-commit-config.yaml` | Hook configuration |
| `scripts/validate_grafana_dashboard.py` | ML dashboard validator |
| `scripts/validate-dashboards.ps1` | PowerShell helper for manual validation |
| `scripts/precommit/check_compose.py` | Docker Compose validator |
| `scripts/precommit/block_secret_files.py` | Secret file blocker |
| `.gitleaks.toml` | Secret scanning config |
| `docs/PRE_COMMIT.md` | Full documentation |

## Next Steps

1. ✅ Install pre-commit: `make precommit-install`
2. ✅ Run on all files once: `make precommit-run`
3. ✅ Commit normally - hooks run automatically
4. ✅ Review `docs/PRE_COMMIT.md` for detailed documentation

## Support

For issues or questions:
- Full docs: `docs/PRE_COMMIT.md`
- Validator source: `scripts/validate_grafana_dashboard.py`
- Helper script: `scripts/validate-dashboards.ps1`
