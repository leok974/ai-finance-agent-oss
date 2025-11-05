# Pre-commit Configuration

This repository uses [pre-commit](https://pre-commit.com/) hooks to maintain code quality and ensure Grafana dashboards meet validation requirements.

## Quick Setup

```bash
# Install pre-commit
pip install pre-commit

# Install git hooks
pre-commit install

# Run on all files (one-time normalization)
pre-commit run --all-files
```

Or using the Makefile:

```bash
make precommit-install
make precommit-run
```

## Hooks Overview

### 1. **Python Code Quality** (Black + Ruff)
- Formats Python code with Black
- Lints and auto-fixes Python issues with Ruff

### 2. **JSON Hygiene**
- `check-json`: Validates JSON syntax
- `end-of-file-fixer`: Ensures files end with newline
- `trailing-whitespace`: Removes trailing whitespace

### 3. **JSON Formatting** (Grafana dashboards)
- Auto-formats dashboard JSON with 2-space indentation
- Preserves field order (no key sorting)
- Applies to: `ops/grafana/**/*.json` and `*ml_suggestions_dashboard.json`

### 4. **JQ Validation**
- Validates JSON structure with `jq`
- Non-destructive linting
- Applies to Grafana dashboard files

### 5. **Grafana Dashboard Validation** (Custom)
- **Script**: `scripts/validate_grafana_dashboard.py`
- **Checks**:
  - ✅ Valid JSON structure
  - ✅ Contains `$prom` datasource variable in `templating.list`
  - ✅ Contains required ML metric queries in panels:
    - `lm_ml_train_val_f1_macro`
    - `lm_ml_predict_requests_total`
    - `lm_suggest_compare_total`

### 6. **Docker Compose Validation**
- Validates `docker-compose*.yml` files
- Script: `scripts/precommit/check_compose.py`

### 7. **Secret Protection**
- Blocks wrapped key exports and service accounts
- Script: `scripts/precommit/block_secret_files.py`

### 8. **Git Secrets Scanning**
- Uses [gitleaks](https://github.com/gitleaks/gitleaks) to detect secrets
- Config: `.gitleaks.toml`

## Dashboard Validation Details

The custom Grafana dashboard validator ensures ML dashboards meet production requirements:

### Required Structure

```json
{
  "dashboard": {
    "templating": {
      "list": [
        {
          "name": "prom",
          "type": "datasource"
        }
      ]
    },
    "panels": [
      {
        "targets": [
          {
            "expr": "lm_ml_train_val_f1_macro{...}"
          }
        ]
      }
    ]
  }
}
```

### Required Metrics

All ML dashboards must include these metrics:

| Metric | Purpose |
|--------|---------|
| `lm_ml_train_val_f1_macro` | Model training quality (F1 score) |
| `lm_ml_predict_requests_total` | Prediction request volume |
| `lm_suggest_compare_total` | Shadow mode comparison metrics |

### Example Validation Output

**✅ Valid dashboard:**
```bash
[ops/grafana/ml_dashboard.json] ✅ Grafana ML dashboard looks good.
```

**❌ Invalid dashboard:**
```bash
[ops/grafana/ml_dashboard.json] ❌ Missing Grafana datasource variable `$prom` in templating.list
[ops/grafana/ml_dashboard.json] ❌ Dashboard panels missing required metrics: lm_ml_train_val_f1_macro
```

## Manual Validation

Run the validator manually on specific files:

```bash
# Single file
python scripts/validate_grafana_dashboard.py ops/grafana/ml_dashboard.json

# Multiple files
python scripts/validate_grafana_dashboard.py ops/grafana/*.json

# Exit code 0 = success, 1 = validation failed
```

## Troubleshooting

### Pre-commit not running
```bash
# Reinstall hooks
pre-commit uninstall
pre-commit install
```

### Skip hooks temporarily
```bash
# Skip all hooks for urgent commit
git commit --no-verify -m "message"

# Skip specific hook
SKIP=grafana-dashboard-validate git commit -m "message"
```

### Update hooks to latest versions
```bash
pre-commit autoupdate
```

### Dashboard validation fails
1. Check that `templating.list` contains a `prom` variable
2. Verify all required metrics are in panel queries
3. Use `jq` to inspect dashboard structure:
   ```bash
   jq '.dashboard.templating.list[] | select(.name=="prom")' ops/grafana/ml_dashboard.json
   jq '.dashboard.panels[].targets[].expr' ops/grafana/ml_dashboard.json | grep -E "lm_(ml|suggest)"
   ```

## CI/CD Integration

Pre-commit hooks run automatically on:
- Every local commit (after `pre-commit install`)
- Pull requests (via GitHub Actions)
- Pushes to main branch (via GitHub Actions)

### Workflows

**1. Pre-commit Validation** (`.github/workflows/pre-commit.yml`)

Runs on every PR and push to main:
- Validates changed files only (fast, efficient)
- Falls back to all files if initial validation fails
- Blocks PR merge if validation fails
- Shows detailed diffs for failed checks

**2. Auto-update Hooks** (`.github/workflows/pre-commit-autoupdate.yml`)

Runs monthly (1st day at 7 AM UTC) or on manual trigger:
- Updates hook versions to latest releases
- Creates a PR automatically with changes
- Labels: `chore`, `ci`, `dependencies`

### GitHub Actions Example

For custom workflows:

```yaml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for diff-based validation

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install pre-commit
        run: pip install pre-commit

      - name: Install jq (for dashboard validation)
        run: sudo apt-get update && sudo apt-get install -y jq

      - name: Run pre-commit
        run: pre-commit run --all-files --show-diff-on-failure
```

### Expected CI Behavior

**✅ Successful validation:**
```
check json...............................................................Passed
Validate Grafana ML dashboard ($prom + required queries).................Passed
All checks passed!
```

**❌ Failed validation (blocks PR):**
```
Validate Grafana ML dashboard ($prom + required queries).................Failed
- hook id: grafana-dashboard-validate
- exit code: 1

[ops/grafana/dashboards/test.json] ❌ Missing Grafana datasource variable `$prom` in templating.list
[ops/grafana/dashboards/test.json] ❌ Dashboard panels missing required metrics: lm_ml_train_val_f1_macro

To fix locally:
  make precommit-install
  make precommit-run
```

## Files

| File | Purpose |
|------|---------|
| `.pre-commit-config.yaml` | Hook configuration |
| `scripts/validate_grafana_dashboard.py` | Dashboard validator script |
| `scripts/precommit/check_compose.py` | Docker Compose linter |
| `scripts/precommit/block_secret_files.py` | Secret protection |
| `.gitleaks.toml` | Secret scanning config |

## Development

### Adding New Dashboard Metrics

Edit `scripts/validate_grafana_dashboard.py`:

```python
REQUIRED_METRICS = [
    "lm_ml_train_val_f1_macro",
    "lm_ml_predict_requests_total",
    "lm_suggest_compare_total",
    "your_new_metric_here",  # Add new metrics
]
```

### Testing Validator Changes

```bash
# Test with current dashboards
python scripts/validate_grafana_dashboard.py ops/grafana/*.json

# Test with sample JSON
echo '{"dashboard":{"templating":{"list":[{"name":"prom"}]},"panels":[]}}' > /tmp/test.json
python scripts/validate_grafana_dashboard.py /tmp/test.json
```

## References

- [pre-commit documentation](https://pre-commit.com/)
- [Black formatter](https://black.readthedocs.io/)
- [Ruff linter](https://docs.astral.sh/ruff/)
- [gitleaks](https://github.com/gitleaks/gitleaks)
- [Grafana Dashboard JSON Schema](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/)
