# E2E Testing Setup with Postgres

This guide explains how to run E2E tests with Postgres (mirroring production) instead of SQLite.

## Prerequisites

- Docker Desktop running
- Python 3.11+ with backend venv set up
- Node.js 20+ with pnpm installed
- Playwright browsers installed

## Quick Start (Windows)

### Option 1: Use the automated script

```powershell
# Start Docker Desktop first, then:
cd c:\ai-finance-agent-oss-clean

# Run visual baseline test and generate screenshot
.\run-e2e.ps1 -UpdateSnapshots -TestPattern "tooltip visual baseline"

# Run all tests (subsequent runs)
.\run-e2e.ps1
```

### Option 2: Manual step-by-step

```powershell
# 1) Start Postgres
docker compose -f docker-compose.e2e.yml up -d db

# 2) Set environment variables
$env:DATABASE_URL = "postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e"
$env:APP_ENV = "dev"
$env:ALLOW_DEV_ROUTES = "1"
$env:DEV_SUPERUSER_EMAIL = "leoklemet.pa@gmail.com"
$env:DEV_SUPERUSER_PIN = "946281"
$env:DEV_E2E_EMAIL = "leoklemet.pa@gmail.com"
$env:DEV_E2E_PASSWORD = "Superleo3"

# 3) Run migrations
cd apps\backend
.\.venv\Scripts\python.exe -m alembic upgrade head

# 4) Reset database (clears all tables)
.\.venv\Scripts\python.exe scripts\e2e_db_reset.py

# 5) Seed test user (adjust based on your CLI)
# .\.venv\Scripts\python.exe -m app.cli_seed_dev_user $env:DEV_E2E_EMAIL $env:DEV_E2E_PASSWORD

# 6) Run Playwright tests
cd ..\web
pnpm exec playwright test tests/e2e/help-tooltips.spec.ts -g "tooltip visual baseline" --update-snapshots
```

## What Changed

### Files Created

1. **`docker-compose.e2e.yml`** - Postgres 16 container for E2E
2. **`apps/backend/scripts/e2e_db_reset.py`** - Truncates all tables between test runs
3. **`run-e2e.ps1`** - Automated setup script for Windows
4. **`.github/workflows/e2e.yml`** - CI workflow for GitHub Actions

### Files Modified

1. **`apps/web/playwright.config.ts`** - Added `DATABASE_URL` to backend webServer env

### Key Changes

- **E2E uses Postgres** via `postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e`
- **Unit tests still use SQLite** (no changes to pytest)
- **Playwright auto-starts backend** with Postgres connection
- **CI mirrors production** with Postgres service container

## Visual Baseline Test

The masked visual regression test is now ready:

```powershell
# First run: Generate baseline
pnpm exec playwright test tests/e2e/help-tooltips.spec.ts -g "tooltip visual baseline" --update-snapshots

# Subsequent runs: Compare against baseline
pnpm exec playwright test tests/e2e/help-tooltips.spec.ts -g "tooltip visual baseline"
```

**Commit the baseline:**
```powershell
git add apps/web/tests/e2e/help-tooltips.spec.ts-snapshots/
git commit -m "test: add Help tooltip visual baseline"
```

## Troubleshooting

### "Docker Desktop is not running"

Start Docker Desktop and wait for it to be ready, then retry.

### "pg_isready: command not found"

The healthcheck runs inside the container, not on your host. If the container is up but unhealthy, check logs:

```powershell
docker compose -f docker-compose.e2e.yml logs db
```

### "unknown function: now()"

This was the original SQLite issue. Postgres has `now()` built-in, so this error should be resolved.

### "auth login failed: 404"

The backend might not have the user seeded. Uncomment the seed step in `run-e2e.ps1` and adjust the CLI command to match your backend's seeding mechanism.

### Reset between test runs

```powershell
$env:DATABASE_URL = "postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e"
cd apps\backend
.\.venv\Scripts\python.exe scripts\e2e_db_reset.py
```

## CI Setup

Add these secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add:
   - `DEV_SUPERUSER_PIN`: Your dev PIN (e.g., `946281`)
   - `DEV_E2E_PASSWORD`: Test user password (e.g., `Superleo3`)

The workflow runs automatically on push/PR to `main`, `dev`, or `website-cleaning`.

## Stopping Postgres

```powershell
# Stop and remove container
docker compose -f docker-compose.e2e.yml down

# Stop but keep data volume
docker compose -f docker-compose.e2e.yml stop
```

## Next Steps

1. Start Docker Desktop
2. Run `.\run-e2e.ps1 -UpdateSnapshots`
3. Review generated `tooltip-baseline.png`
4. Commit the baseline screenshot
5. Future test runs will compare against this baseline
