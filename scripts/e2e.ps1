param(
  [string]$Grep = "",                 # e.g. "tooltip visual baseline"
  [switch]$Baseline,                  # --update-snapshots
  [switch]$Down                       # docker compose down after run
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $repo

# ---------- Config ----------
$env:DATABASE_URL       = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e" }
$env:APP_ENV            = "dev"
$env:ALLOW_DEV_ROUTES   = "1"
$env:DEV_SUPERUSER_EMAIL= if ($env:DEV_SUPERUSER_EMAIL) { $env:DEV_SUPERUSER_EMAIL } else { "leoklemet.pa@gmail.com" }
$env:DEV_SUPERUSER_PIN  = if ($env:DEV_SUPERUSER_PIN) { $env:DEV_SUPERUSER_PIN } else { "946281" }
$env:DEV_E2E_EMAIL      = if ($env:DEV_E2E_EMAIL) { $env:DEV_E2E_EMAIL } else { "leoklemet.pa@gmail.com" }
$env:DEV_E2E_PASSWORD   = if ($env:DEV_E2E_PASSWORD) { $env:DEV_E2E_PASSWORD } else { "Superleo3" }

# ---------- Start Postgres ----------
Write-Host "🗄️  Starting Postgres (docker compose)..." -ForegroundColor Cyan
docker compose -f docker-compose.e2e.yml up -d pg

# Wait for health
Write-Host "⏳ Waiting for Postgres to be healthy..."
$ok = $false
for ($i=0; $i -lt 60; $i++) {
  try {
    $result = docker compose -f docker-compose.e2e.yml exec -T pg pg_isready -U app -d app_e2e 2>&1
    if ($LASTEXITCODE -eq 0) {
      $ok = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $ok) {
  Write-Host "❌ Postgres not healthy in time." -ForegroundColor Red
  exit 1
}
Write-Host "✅ Postgres is healthy" -ForegroundColor Green

# ---------- Backend: migrate, reset, seed ----------
Write-Host "🧱 Migrating + resetting + seeding..." -ForegroundColor Cyan
Push-Location apps\backend
$dbHost = $env:E2E_DB_HOST
if ([string]::IsNullOrEmpty($dbHost)) { $dbHost = '127.0.0.1' }
$env:DATABASE_URL = "postgresql+psycopg://app:app@$dbHost:5432/app_e2e"
Write-Host "  📦 Installing backend dependencies..."
& python -m pip install -r requirements.txt -q
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "  🔄 Running migrations..."
& python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Migration failed" -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "  🗑️  Resetting database..."
& python scripts/e2e_db_reset.py
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Database reset failed" -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "  🌱 Seeding test user..."
& python -m app.cli_seed_dev_user $env:DEV_E2E_EMAIL $env:DEV_E2E_PASSWORD
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ User seeding failed" -ForegroundColor Red
  Pop-Location
  exit 1
}
Pop-Location
Write-Host "✅ Backend setup complete" -ForegroundColor Green

# ---------- Playwright: install deps & run ----------
Push-Location apps\web
Write-Host "📦 Installing web dependencies..." -ForegroundColor Cyan
& pnpm i
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Failed to install web dependencies" -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "🎭 Installing Playwright browsers..." -ForegroundColor Cyan
& pnpm exec playwright install --with-deps chromium
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Failed to install Playwright browsers" -ForegroundColor Red
  Pop-Location
  exit 1
}

$playwrightArgs = @("exec", "playwright", "test")
if ($Grep -ne "") {
  $playwrightArgs += @("-g", $Grep)
  Write-Host "🔍 Running tests matching: $Grep" -ForegroundColor Cyan
}
if ($Baseline.IsPresent) {
  $playwrightArgs += "--update-snapshots"
  Write-Host "📸 Updating snapshots (baseline mode)" -ForegroundColor Cyan
}

Write-Host "🎭 Running Playwright E2E tests..." -ForegroundColor Cyan
& pnpm @playwrightArgs
$code = $LASTEXITCODE
Pop-Location

if ($Down.IsPresent) {
  Write-Host "🧹 Bringing down docker compose..." -ForegroundColor DarkGray
  docker compose -f docker-compose.e2e.yml down -v
}

if ($code -ne 0) {
  Write-Host "❌ E2E tests failed" -ForegroundColor Red
  exit $code
}
Write-Host "✅ E2E tests completed successfully!" -ForegroundColor Green
