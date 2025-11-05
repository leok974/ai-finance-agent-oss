# E2E Setup and Run Script for Windows
# Sets up Postgres, migrates DB, seeds test user, and runs Playwright E2E tests

param(
    [switch]$UpdateSnapshots,
    [string]$TestPattern = "tooltip visual baseline"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting E2E test environment setup..." -ForegroundColor Cyan

# 1) Start Postgres
Write-Host "`n📦 Starting Postgres container..." -ForegroundColor Yellow
docker compose -f docker-compose.e2e.yml up -d db
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start Postgres" -ForegroundColor Red
    exit 1
}

# Wait for Postgres to be healthy
Write-Host "⏳ Waiting for Postgres to be ready..." -ForegroundColor Yellow
$maxRetries = 30
$retryCount = 0
while ($retryCount -lt $maxRetries) {
    $health = docker compose -f docker-compose.e2e.yml ps --format json | ConvertFrom-Json | Where-Object { $_.Service -eq "db" } | Select-Object -ExpandProperty Health
    if ($health -eq "healthy") {
        Write-Host "✅ Postgres is healthy" -ForegroundColor Green
        break
    }
    $retryCount++
    Start-Sleep -Seconds 2
}

if ($retryCount -eq $maxRetries) {
    Write-Host "❌ Postgres failed to become healthy" -ForegroundColor Red
    exit 1
}

# 2) Set environment variables
$env:DATABASE_URL = "postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e"
$env:APP_ENV = "dev"
$env:ALLOW_DEV_ROUTES = "1"
$env:DEV_SUPERUSER_EMAIL = "leoklemet.pa@gmail.com"
$env:DEV_SUPERUSER_PIN = "946281"
$env:DEV_E2E_EMAIL = "leoklemet.pa@gmail.com"
$env:DEV_E2E_PASSWORD = "Superleo3"

# 3) Run migrations
Write-Host "`n🔄 Running database migrations..." -ForegroundColor Yellow
Push-Location apps\backend
& .\.venv\Scripts\python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Migration failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✅ Migrations complete" -ForegroundColor Green

# 4) Reset database
Write-Host "`n🔄 Resetting database..." -ForegroundColor Yellow
& .\.venv\Scripts\python.exe scripts\e2e_db_reset.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database reset failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✅ Database reset complete" -ForegroundColor Green

# 5) Seed test user (if you have a CLI command)
# Uncomment and adjust if you have a seed command:
# Write-Host "`n🌱 Seeding test user..." -ForegroundColor Yellow
# & .\.venv\Scripts\python.exe -m app.cli_seed_dev_user $env:DEV_E2E_EMAIL $env:DEV_E2E_PASSWORD
# Write-Host "✅ User seeded" -ForegroundColor Green

Pop-Location

# 6) Run Playwright tests
Write-Host "`n🎭 Running Playwright E2E tests..." -ForegroundColor Yellow
Push-Location apps\web

$playwrightArgs = @(
    "exec", "playwright", "test",
    "tests/e2e/help-tooltips.spec.ts",
    "-g", $TestPattern
)

if ($UpdateSnapshots) {
    $playwrightArgs += "--update-snapshots"
    Write-Host "📸 Running with --update-snapshots" -ForegroundColor Cyan
}

& pnpm @playwrightArgs

$testResult = $LASTEXITCODE
Pop-Location

if ($testResult -eq 0) {
    Write-Host "`n✅ All E2E tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n❌ E2E tests failed" -ForegroundColor Red
}

# Optional: Stop Postgres
# Write-Host "`n🛑 Stopping Postgres..." -ForegroundColor Yellow
# docker compose -f docker-compose.e2e.yml down

exit $testResult
