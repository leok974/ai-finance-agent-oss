# Pre-commit Setup Complete ✅

## What Was Configured

### 1. Git Hooks (`.pre-commit-config.yaml`)

**Validation pipeline:**
```
JSON Syntax → JSON Formatting → JQ Validation → ML Dashboard Validation
     ↓              ↓                 ↓                    ↓
Python Linting → Secret Scanning → Docker Compose Validation
```

**ML Dashboard Requirements:**
- ✅ Contains `$prom` datasource variable
- ✅ Contains metrics: `lm_ml_train_val_f1_macro`, `lm_ml_predict_requests_total`, `lm_suggest_compare_total`
- ✅ Valid JSON structure
- ⏭️ Non-ML dashboards automatically skipped

### 2. CI Workflows

**A. Pre-commit Validation** (`.github/workflows/pre-commit.yml`)
- **Triggers**: PRs, pushes to `main`
- **Strategy**: Validates changed files first, falls back to all files
- **Blocks**: PR merge if validation fails
- **Timeout**: 15 minutes

**B. Auto-update Hooks** (`.github/workflows/pre-commit-autoupdate.yml`)
- **Schedule**: 1st of every month at 7 AM UTC
- **Action**: Creates PR with updated hook versions
- **Labels**: `chore`, `ci`, `dependencies`
- **Assignee**: Repository owner

### 3. Scripts

**A. Python Validator** (`scripts/validate_grafana_dashboard.py`)
- Validates ML dashboard structure
- Smart detection (filename/title heuristics)
- Detailed error messages
- Exit codes for CI integration

**B. PowerShell Helper** (`scripts/validate-dashboards.ps1`)
- Windows-friendly wrapper
- Auto-discovers dashboards
- Optional strict mode
- Colored output

### 4. Makefile Targets

```bash
make precommit-install              # One-time setup
make precommit-run                  # Validate all files
make precommit-autoupdate           # Update hook versions
make precommit-validate-dashboards  # Dashboards only
```

### 5. Documentation

| Document | Purpose |
|----------|---------|
| `docs/PRE_COMMIT.md` | Comprehensive guide (hooks, validation, CI) |
| `PRE_COMMIT_QUICK_START.md` | Quick reference with examples |
| `PRE_COMMIT_SMOKE_TEST.md` | Copy-paste smoke test checklist |

## Validation Status

**Existing dashboards tested:**

| Dashboard | Status | Reason |
|-----------|--------|--------|
| `ml-suggestions.json` | ✅ **Validated** | Contains required ML metrics |
| `ingest-health.json` | ⏭️ Skipped | Non-ML dashboard |
| `kms-health.json` | ⏭️ Skipped | Non-ML dashboard |
| `ledgermind-fallback-dashboard.json` | ⏭️ Skipped | Non-ML dashboard |

## Quick Start

### First-Time Setup

```bash
# 1. Install pre-commit
pip install pre-commit
cd C:\ai-finance-agent-oss-clean
pre-commit install

# 2. Run on all files (normalize)
pre-commit run --all-files

# 3. Verify dashboards
.\scripts\validate-dashboards.ps1
```

### Daily Workflow

```bash
# Make changes
git add ops/grafana/dashboards/ml-suggestions.json

# Commit (pre-commit runs automatically)
git commit -m "feat: update ML dashboard"

# If validation fails, fix and retry
# ... fix issues ...
git add .
git commit -m "feat: update ML dashboard"
```

### CI Workflow

```
Developer pushes → PR created → GitHub Actions runs → Pre-commit validates
                                                              ↓
                                                    Pass: ✅ Allow merge
                                                    Fail: ❌ Block merge
```

## Smoke Test Results

**Command:** `.\scripts\validate-dashboards.ps1`

**Output:**
```
🔍 Found 4 dashboard file(s) to validate

Running dashboard validator...
Script: C:\ai-finance-agent-oss-clean\scripts\validate_grafana_dashboard.py

[...\ledgermind-fallback-dashboard.json] ⏭️  Skipped (non-ML dashboard)
[...\dashboards\ingest-health.json] ⏭️  Skipped (non-ML dashboard)
[...\dashboards\kms-health.json] ⏭️  Skipped (non-ML dashboard)
[...\dashboards\ml-suggestions.json] ✅ Grafana ML dashboard looks good.

✅ All dashboards validated successfully
```

## Hook Behavior

### What Happens on Commit

1. **JSON Files**:
   - Syntax validation
   - Auto-formatting (2-space indent, preserved order)
   - JQ structure validation

2. **Grafana Dashboards** (ML only):
   - Checks for `$prom` variable
   - Validates required metrics
   - Skips non-ML dashboards automatically

3. **Python Files**:
   - Black auto-formatting
   - Ruff linting and auto-fixes

4. **Security**:
   - Secret scanning (gitleaks)
   - Credential file blocking

5. **Docker Compose**:
   - YAML validation
   - Structure checks

### Commit Outcomes

**✅ All hooks pass:**
```bash
git commit -m "feat: update"
```
```
check json...............................................................Passed
Validate Grafana ML dashboard........................................Passed
[main abc1234] feat: update
```

**❌ Validation fails:**
```bash
git commit -m "feat: update"
```
```
Validate Grafana ML dashboard........................................Failed
- hook id: grafana-dashboard-validate
- exit code: 1

[ops/grafana/ml-test.json] ❌ Missing Grafana datasource variable `$prom`
```

**⚠️ Auto-fixed files:**
```bash
git commit -m "feat: update"
```
```
pretty format json.......................................................Failed
- hook id: pretty-format-json
- files were modified by this hook

Re-add fixed files and retry:
  git add ops/grafana/dashboards/ml-suggestions.json
  git commit
```

## CI Integration

### PR Workflow

```mermaid
graph LR
    A[Push to PR] --> B[CI Triggered]
    B --> C{Pre-commit Validate}
    C -->|Pass| D[✅ Allow Merge]
    C -->|Fail| E[❌ Block Merge]
    E --> F[Fix Issues]
    F --> A
```

### Auto-update Workflow

```mermaid
graph LR
    A[Monthly Schedule] --> B[Run pre-commit autoupdate]
    B --> C[Create PR]
    C --> D{Review Changes}
    D -->|Approve| E[Merge]
    D -->|Reject| F[Close PR]
```

## Troubleshooting

### Issue: Pre-commit not running

**Fix:**
```bash
pre-commit uninstall
pre-commit install
pre-commit run --all-files
```

### Issue: Dashboard validation too strict

**Options:**
1. Rename file (remove "ml", "suggest", "predict", "train" from name)
2. Skip hook: `SKIP=grafana-dashboard-validate git commit -m "..."`
3. Emergency bypass: `git commit --no-verify -m "..."`

### Issue: CI fails on PR

**Fix locally:**
```bash
# Run same checks as CI
pre-commit run --all-files

# Or just validate dashboards
python scripts/validate_grafana_dashboard.py ops/grafana/dashboards/*.json

# Fix issues, then push
git add .
git commit -m "fix: address pre-commit issues"
git push
```

### Issue: Python not found (Windows)

**Fix:**
```powershell
# Use Python module directly
python -m pre_commit run --all-files

# Or ensure Python Scripts in PATH
$env:Path += ";C:\Users\<You>\AppData\Roaming\Python\Python311\Scripts"
```

## Files Created

```
.github/workflows/
├── pre-commit.yml                    # CI validation workflow
└── pre-commit-autoupdate.yml         # Auto-update workflow

scripts/
├── validate_grafana_dashboard.py     # Python validator (enhanced)
└── validate-dashboards.ps1           # PowerShell helper (new)

docs/
└── PRE_COMMIT.md                     # Full documentation

.
├── .pre-commit-config.yaml           # Hook configuration (enhanced)
├── PRE_COMMIT_QUICK_START.md         # Quick reference
├── PRE_COMMIT_SMOKE_TEST.md          # Smoke test checklist
├── PRE_COMMIT_SETUP_COMPLETE.md      # This file
└── Makefile                          # Added precommit targets
```

## Metrics

- **Hooks configured**: 11
- **Dashboards validated**: 4 (1 ML, 3 skipped)
- **CI workflows**: 2
- **Documentation pages**: 3
- **Scripts**: 2
- **Makefile targets**: 4

## Next Steps

1. ✅ **Setup complete** - All files created and tested
2. 🔄 **Run smoke test**: `.\scripts\validate-dashboards.ps1`
3. 📝 **Test commit flow**: Make a change and commit
4. 🚀 **Open a PR**: Verify CI validation works
5. 📅 **Wait for auto-update**: Check PR created on 1st of month

## Success Criteria Met

- [x] Pre-commit hooks installed and configured
- [x] ML dashboard validator working (smart detection)
- [x] Non-ML dashboards automatically skipped
- [x] CI workflows created (validation + auto-update)
- [x] Makefile targets added (4 new commands)
- [x] Documentation complete (3 comprehensive guides)
- [x] PowerShell helper for Windows users
- [x] Smoke test passed (4/4 dashboards handled correctly)

## Support

- **Full guide**: `docs/PRE_COMMIT.md`
- **Quick start**: `PRE_COMMIT_QUICK_START.md`
- **Smoke test**: `PRE_COMMIT_SMOKE_TEST.md`
- **Validator source**: `scripts/validate_grafana_dashboard.py`
- **Helper script**: `scripts/validate-dashboards.ps1`

---

**✅ Pre-commit setup is complete and ready for production use!**

To get started:
```bash
pip install pre-commit
cd C:\ai-finance-agent-oss-clean
pre-commit install
pre-commit run --all-files
```
