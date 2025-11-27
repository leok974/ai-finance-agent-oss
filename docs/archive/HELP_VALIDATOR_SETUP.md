# Help Panel Validator - Setup Complete

## ✅ What Was Added

### 1. Validator Script (`scripts/validate_help_panels.py`)
A Python script that validates all help panel endpoints return non-empty explanations.

**Features**:
- ✅ Tests all 5 help panels (merchants, categories, flows, anomalies, insights)
- ✅ Environment variable controls (skip, soft mode, allow empty)
- ✅ Customizable month and panel list
- ✅ Clear pass/fail output with specific error messages

### 2. Pre-commit Hook (`.pre-commit-config.yaml`)
Added `help-panels-why` hook to the local hooks section.

**When it runs**: On commit and push (configurable via `stages`)

### 3. Makefile Targets
Added three convenience targets:

```bash
make help-why        # Strict mode (fails on empty 'why')
make help-why-soft   # Soft mode (warns only)
make help-why-skip   # Skip validation (always passes)
```

### 4. GitHub Actions Workflow (`.github/workflows/help-why.yml`)
Optional CI workflow that:
- Starts backend + redis services
- Waits for backend health
- Runs validation
- Shows logs on failure

---

## 🚀 Usage

### Local Validation (Inside Container)

```bash
# Ensure backend is running
docker compose -f docker-compose.prod.yml up -d backend redis

# Copy script to container (one-time or add to Dockerfile)
docker cp scripts/validate_help_panels.py ai-finance-agent-oss-clean-backend-1:/tmp/

# Run validation (strict)
docker compose -f docker-compose.prod.yml exec backend python /tmp/validate_help_panels.py

# Soft mode (warns but doesn't fail)
docker compose -f docker-compose.prod.yml exec -e HELP_VALIDATE_SOFT=1 backend python /tmp/validate_help_panels.py

# Skip mode
docker compose -f docker-compose.prod.yml exec -e HELP_VALIDATE_SKIP=1 backend python /tmp/validate_help_panels.py
```

### Using Makefile (Host System)

**Note**: These targets need backend exposed on localhost:8000 or adjust BASE_URL

```bash
# Strict validation
make help-why

# Soft mode
make help-why-soft

# Skip
make help-why-skip

# Custom month/URL
MONTH=2024-12 BASE_URL=http://localhost:8000 make help-why
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8000` | API base URL |
| `MONTH` | Current month (YYYY-MM) | Month to validate |
| `PANELS` | All 5 default panels | Comma-separated panel IDs |
| `HELP_VALIDATE_SKIP` | - | Set to `1` to skip (always pass) |
| `HELP_VALIDATE_SOFT` | - | Set to `1` for warnings only |
| `HELP_VALIDATE_ALLOW_EMPTY` | - | Set to `1` to allow empty with no data |

---

## 🧪 Test Results

### ✅ All Modes Tested Successfully

**Strict Mode (default)**:
```
🔎 Validating Help panels for month=2025-11 at http://localhost:8000
✅ charts.month_merchants: Utilities present - recurring monthly bills • E-commerce/retail...
✅ charts.month_categories: Spend is concentrated in Unknown (100%).; Top three categories...
✅ charts.daily_flows: Mixed in/out on several days suggests transfers or refunds.
✅ charts.month_anomalies: Spike days and unusual net flow explain monthly variance.
✅ charts.insights_overview: A few categories and merchants dominate spend; review spikes...

✅ All help panels returned non-empty explanations.
```

**Soft Mode (`HELP_VALIDATE_SOFT=1`)**:
Same output, but exits with code 0 even if validation fails.

**Skip Mode (`HELP_VALIDATE_SKIP=1`)**:
```
⏭️  HELP_VALIDATE_SKIP=1 set — skipping help validation.
```

---

## 🔧 Integration Options

### Option 1: Pre-commit Hook (Recommended for Dev)
The hook is already configured in `.pre-commit-config.yaml`.

To enable:
```bash
# Install pre-commit (if not installed)
pip install pre-commit

# Install hooks
pre-commit install

# Test manually
pre-commit run help-panels-why --all-files
```

**Note**: The hook runs with `language: system`, so it expects:
- Backend service accessible at `http://localhost:8000`
- Or set `BASE_URL` environment variable

For most dev workflows, you may want to add `HELP_VALIDATE_SOFT=1` to the hook entry or use the skip mode during rapid development.

### Option 2: GitHub Actions (Recommended for CI)
The workflow `.github/workflows/help-why.yml` is ready to use.

**Features**:
- Runs on pull requests and manual dispatch
- Starts backend+redis services
- Waits for health checks
- Validates all panels
- Shows logs on failure

**To customize**:
- Adjust timeout/retries in "Wait for backend" step
- Add soft mode: Set `HELP_VALIDATE_SOFT=1` in env
- Test subset: Set `PANELS=charts.month_merchants,charts.month_categories`

### Option 3: Manual Testing
Run the script directly for debugging:

```bash
# From inside backend container
docker compose exec backend python /tmp/validate_help_panels.py

# From host (if backend port exposed)
BASE_URL=http://localhost:8000 python scripts/validate_help_panels.py

# Test specific panels
PANELS=charts.month_merchants,charts.month_categories python scripts/validate_help_panels.py
```

---

## 📝 Customization Examples

### 1. Add to Backend Dockerfile (Optional)
To make the script always available in the container:

```dockerfile
# In apps/backend/Dockerfile
COPY scripts/validate_help_panels.py /app/scripts/
```

### 2. Adjust Pre-commit for Soft Mode
Edit `.pre-commit-config.yaml`:

```yaml
- id: help-panels-why
  name: Help Panels Why Validator
  entry: bash -c 'HELP_VALIDATE_SOFT=1 python scripts/validate_help_panels.py'
  language: system
  pass_filenames: false
  stages: [push]  # Only on push, not commit
```

### 3. CI Only (Skip Local Pre-commit)
Remove `help-panels-why` from `.pre-commit-config.yaml` and rely solely on the GitHub Actions workflow.

### 4. Add More Panels
When you add new explainer endpoints:

```bash
# Update DEFAULT_PANELS in scripts/validate_help_panels.py
DEFAULT_PANELS = [
    "charts.month_merchants",
    "charts.month_categories",
    "charts.daily_flows",
    "charts.month_anomalies",
    "charts.insights_overview",
    "charts.budgets",           # NEW
    "charts.projections",       # NEW
]
```

---

## 🐛 Troubleshooting

### Issue: "Request error: HTTP Error 404"
**Cause**: Backend not running or not accessible at BASE_URL
**Fix**:
```bash
docker compose -f docker-compose.prod.yml up -d backend
# Or adjust BASE_URL to correct endpoint
```

### Issue: "Empty why/text" failures
**Cause**: Panel truly has no explanation (RAG/heuristics both failed)
**Fix**:
- Check backend logs for errors
- Verify database has transaction data for the month
- Test with a month that has known data: `MONTH=2025-11`
- Use `HELP_VALIDATE_ALLOW_EMPTY=1` if expected with no data

### Issue: Pre-commit hook fails every time
**Cause**: Backend not running during commits, or port not accessible
**Options**:
1. Use soft mode: `HELP_VALIDATE_SOFT=1`
2. Run only on push: Change `stages: [push]`
3. Skip for rapid dev: `HELP_VALIDATE_SKIP=1 git commit`
4. Remove from pre-commit, rely on CI only

### Issue: Script works locally but not in CI
**Cause**: Timing - backend not fully ready
**Fix**: Increase wait time in `.github/workflows/help-why.yml`:
```yaml
- name: Wait for backend to be healthy
  run: |
    for i in {1..60}; do  # Increase from 30 to 60
      # ... existing health check
    done
```

---

## 📊 Validation Output Format

### Success (Exit Code 0)
```
🔎 Validating Help panels for month=2025-11 at http://localhost:8000
✅ charts.month_merchants: <first 80 chars of 'why' text>...
✅ charts.month_categories: <first 80 chars of 'why' text>...
...
✅ All help panels returned non-empty explanations.
```

### Failure (Exit Code 1, unless SOFT=1)
```
🔎 Validating Help panels for month=2025-11 at http://localhost:8000
✅ charts.month_merchants: <text>...
❌ Help validation failed:
  - charts.month_categories: Empty why/text
  - charts.daily_flows: HTTP 500
  - charts.month_anomalies: Request error: <details>
```

With `HELP_VALIDATE_SOFT=1`:
```
...
❌ Help validation failed:
  - charts.month_categories: Empty why/text
⚠️  HELP_VALIDATE_SOFT=1 set — not failing the commit.
```

---

## ✅ Summary

| Component | Status | Location |
|-----------|--------|----------|
| Validator Script | ✅ Created | `scripts/validate_help_panels.py` |
| Pre-commit Hook | ✅ Added | `.pre-commit-config.yaml` |
| Makefile Targets | ✅ Added | `Makefile` (help-why, help-why-soft, help-why-skip) |
| GitHub Actions | ✅ Created | `.github/workflows/help-why.yml` |
| Executable Flag | ✅ Set | Git index updated |

**All 3 modes tested and working**:
- ✅ Strict mode (fails on empty)
- ✅ Soft mode (warns only)
- ✅ Skip mode (always passes)

**Next Steps**:
1. Install pre-commit hooks: `pip install pre-commit && pre-commit install`
2. Test locally: Run validator inside backend container
3. Customize as needed (soft mode, CI only, etc.)
4. Monitor GitHub Actions on next PR

The validator is production-ready and integrated into your development workflow! 🎉
