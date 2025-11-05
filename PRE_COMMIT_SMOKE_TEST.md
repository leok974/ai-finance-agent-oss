# Pre-commit Smoke Test Checklist

Quick copy-paste commands to set up and validate pre-commit hooks.

## 🚀 Initial Setup (One-Time)

```bash
# Install pre-commit and set up git hooks
make precommit-install
```

**What this does:**
- Installs `pre-commit` Python package
- Installs git pre-commit hooks
- Hooks will run automatically on every `git commit`

## ✅ Validate Everything Now

```bash
# Run all pre-commit checks on all files
make precommit-run
```

**Expected behavior:**
- Formats JSON files (2-space indent)
- Validates JSON syntax
- Runs Black/Ruff on Python code
- **Validates ML Grafana dashboards**:
  - Must have `$prom` datasource variable
  - Must contain metrics: `lm_ml_train_val_f1_macro`, `lm_ml_predict_requests_total`, `lm_suggest_compare_total`
- Checks for secrets/credentials
- Validates docker-compose files

## 🧪 Test ML Dashboard Validation

```bash
# Validate all dashboards
make precommit-validate-dashboards

# Or manually test specific file
python scripts/validate_grafana_dashboard.py ops/grafana/dashboards/ml-suggestions.json
```

**Expected output for ML dashboard:**
```
[ops/grafana/dashboards/ml-suggestions.json] ✅ Grafana ML dashboard looks good.
```

**Expected output for non-ML dashboard:**
```
[ops/grafana/dashboards/ingest-health.json] ⏭️ Skipped (non-ML dashboard)
```

## 📝 Test Git Commit Flow

```bash
# Make a small change to a dashboard
echo " " >> ops/grafana/dashboards/ml-suggestions.json

# Stage the file
git add ops/grafana/dashboards/ml-suggestions.json

# Commit (pre-commit hooks run automatically)
git commit -m "test: pre-commit validation"
```

**What should happen:**
1. Pre-commit runs automatically
2. JSON formatter fixes trailing whitespace
3. Dashboard validator checks ML requirements
4. If validation passes: commit succeeds
5. If validation fails: commit is blocked with error message

## 🔧 Fix Common Issues

### Issue: Dashboard missing `$prom` variable

**Fix:**
```json
{
  "dashboard": {
    "templating": {
      "list": [
        {
          "name": "prom",
          "type": "datasource",
          "query": "prometheus"
        }
      ]
    }
  }
}
```

### Issue: Dashboard missing required metrics

**Fix:** Add panels with metric queries:
```json
{
  "panels": [
    {
      "targets": [
        {
          "expr": "lm_ml_train_val_f1_macro"
        }
      ]
    },
    {
      "targets": [
        {
          "expr": "lm_ml_predict_requests_total"
        }
      ]
    },
    {
      "targets": [
        {
          "expr": "lm_suggest_compare_total"
        }
      ]
    }
  ]
}
```

### Issue: Pre-commit not running

**Fix:**
```bash
# Reinstall hooks
pre-commit uninstall
make precommit-install
```

### Issue: Want to bypass validation temporarily

**Fix:**
```bash
# Skip all hooks (emergency only)
git commit --no-verify -m "Emergency fix"

# Or skip specific hook
SKIP=grafana-dashboard-validate git commit -m "WIP: dashboard"
```

## 🤖 CI Validation

Once you open a PR, GitHub Actions will automatically:

1. ✅ Run all pre-commit hooks
2. ✅ Validate ML dashboards
3. ✅ Block PR merge if validation fails

**Workflow file:** `.github/workflows/pre-commit.yml`

## 📊 Validation Summary

After running `make precommit-run`, you should see:

```
check json...............................................................Passed
fix end of files.........................................................Passed
trim trailing whitespace.................................................Passed
pretty format json.......................................................Passed
jq validate dashboards...................................................Passed
Validate Grafana ML dashboard ($prom + required queries).................Passed
check for added large files..............................................Passed
gitleaks.................................................................Passed
```

## 🔄 Update Hook Versions (Monthly)

```bash
# Update to latest hook versions
make precommit-autoupdate

# Test updated hooks
make precommit-run

# Commit changes
git add .pre-commit-config.yaml
git commit -m "chore: update pre-commit hooks"
```

Or let the automated workflow do it (runs monthly):
- **Workflow:** `.github/workflows/pre-commit-autoupdate.yml`
- Creates a PR automatically with hook updates

## 📚 Additional Resources

| Resource | Location |
|----------|----------|
| Full documentation | `docs/PRE_COMMIT.md` |
| Quick start guide | `PRE_COMMIT_QUICK_START.md` |
| Validator script | `scripts/validate_grafana_dashboard.py` |
| PowerShell helper | `scripts/validate-dashboards.ps1` |
| CI workflow | `.github/workflows/pre-commit.yml` |
| Auto-update workflow | `.github/workflows/pre-commit-autoupdate.yml` |

## ✅ Success Criteria

You've successfully set up pre-commit if:

- [x] `make precommit-install` completes without errors
- [x] `make precommit-run` validates all files
- [x] ML dashboard (`ml-suggestions.json`) passes validation
- [x] Non-ML dashboards are skipped automatically
- [x] Git commits trigger pre-commit hooks automatically
- [x] CI workflow runs on PRs

## 🎯 Quick Commands Reference

```bash
# Setup (one-time)
make precommit-install

# Validate everything
make precommit-run

# Validate dashboards only
make precommit-validate-dashboards

# Update hook versions
make precommit-autoupdate

# Manual validation
python scripts/validate_grafana_dashboard.py ops/grafana/dashboards/*.json
.\scripts\validate-dashboards.ps1

# Bypass hooks (emergency)
git commit --no-verify -m "message"
SKIP=grafana-dashboard-validate git commit -m "message"
```

## 🪟 Windows-Specific Notes

If `pre-commit` command not found:

1. Ensure Python Scripts directory is in PATH:
   ```powershell
   # Add to PATH (example)
   $env:Path += ";C:\Users\<YourUser>\AppData\Roaming\Python\Python311\Scripts"
   ```

2. Or use Python module directly:
   ```powershell
   python -m pre_commit run --all-files
   ```

3. Or use Makefile (recommended):
   ```bash
   make precommit-run
   ```

---

**Copy-paste full workflow:**

```bash
# 1. Setup
make precommit-install

# 2. Normalize & validate
make precommit-run

# 3. Make changes and commit
git add .
git commit -m "feat: my changes"  # Pre-commit runs automatically

# 4. Open PR - CI will validate
git push origin my-branch
```

✅ **Done!** Pre-commit will now protect your repository from invalid dashboards and code quality issues.
