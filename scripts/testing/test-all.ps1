<#
.SYNOPSIS
  Hermetic test runner for all project tests (backend + E2E).

.PARAMETER Baseline
  Pass --update-snapshots to Playwright for visual baseline updates.

.PARAMETER Grep
  Optional filter pattern for Playwright tests (-g flag).

.EXAMPLE
  pwsh .\scripts\test-all.ps1
  pwsh .\scripts\test-all.ps1 -Baseline
  pwsh .\scripts\test-all.ps1 -Grep "tooltip visual baseline"
#>
Param(
  [switch]$Baseline,   # pass to Playwright as --update-snapshots
  [string]$Grep = ""   # optional -g filter for Playwright
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---- Resolve repo layout (backend and web) ----
$root = Split-Path -Parent $PSCommandPath | Split-Path -Parent
Set-Location $root

function Find-Dir($candidates) {
  foreach ($c in $candidates) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  return $null
}

$backendDir = Find-Dir @("apps\backend", "backend", "server", "api")
$webDir = Find-Dir @("apps\web", "web", "frontend", "ui")
if (-not $webDir) { throw "Web directory not found. Create apps/web or web." }

# ---- Cleanup port 8000 ----
Write-Host "🧹 Cleaning up port 8000..." -ForegroundColor Yellow
$port8000Process = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($port8000Process) {
  foreach ($processId in $port8000Process) {
    Write-Host "   Killing process $processId on port 8000" -ForegroundColor Yellow
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  Write-Host "   ✅ Port 8000 cleaned" -ForegroundColor Green
} else {
  Write-Host "   ✅ Port 8000 already free" -ForegroundColor Green
}
Write-Host ""

# ---- Check current Docker context ----
$currentContext = docker context show 2>&1
Write-Host "🐳 Docker context: $currentContext" -ForegroundColor Cyan
Write-Host "🐳 Checking Docker..." -ForegroundColor Cyan
try {
  $dockerCheck = docker ps 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Docker not responding"
  }
  Write-Host "   ✅ Docker is running" -ForegroundColor Green
} catch {
  Write-Host "   ❌ Docker Desktop is not running!" -ForegroundColor Red
  Write-Host "   Please start Docker Desktop and try again." -ForegroundColor Yellow
  exit 1
}
Write-Host ""

Write-Host "🔧 Test Runner Configuration" -ForegroundColor Cyan
Write-Host "   Root: $root" -ForegroundColor Gray
Write-Host "   Backend: $(if($backendDir){'✅ '+$backendDir}else{'❌ Not found'})" -ForegroundColor Gray
Write-Host "   Web: ✅ $webDir" -ForegroundColor Gray
Write-Host ""

# ---- Optional: ensure shared infra is running (D:\infra or ../infra) ----
$infra = $env:INFRA_DIR
if ([string]::IsNullOrEmpty($infra)) {
  $guess = @("D:\infra", "..\..\infra", "..\infra")
  foreach ($g in $guess) {
    if (Test-Path $g) {
      $infra = (Resolve-Path $g).Path
      break
    }
  }
}
if ($infra -and (Test-Path (Join-Path $infra "compose.yml"))) {
  Write-Host "🏗️  Starting shared infra: $infra" -ForegroundColor Cyan
  Push-Location $infra
  docker compose up -d
  Pop-Location
}

# ---- Bring up project-scoped Postgres for E2E if docker-compose.e2e.yml exists ----
if (Test-Path "$root\docker-compose.e2e.yml") {
  Write-Host "🗄️  Checking E2E Postgres..." -ForegroundColor Cyan

  # Check if infra or main stack Postgres is already running
  $existingPg = docker ps --format '{{.Names}}' | Select-String -Pattern '(infra-pg-1|ai-finance-postgres-1)'

  if ($existingPg) {
    Write-Host "   ✅ Using existing Postgres: $existingPg" -ForegroundColor Green
  } else {
    Write-Host "   Starting E2E Postgres..." -ForegroundColor Gray
    docker compose -f docker-compose.e2e.yml up -d pg
    # Wait for health
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
      try {
        $null = docker compose -f docker-compose.e2e.yml exec -T pg pg_isready -U app -d app_e2e 2>&1
        if ($LASTEXITCODE -eq 0) {
          $ok = $true
          break
        }
      } catch {}
      Start-Sleep -Seconds 2
    }
    if (-not $ok) { throw "E2E Postgres not healthy." }
    Write-Host "   ✅ Postgres healthy" -ForegroundColor Green
  }
}

# ---- Ensure models if script exists ----
if (Test-Path "$root\scripts\ensure-models.ps1") {
  Write-Host ""
  & pwsh "$root\scripts\ensure-models.ps1"
}

# ---- Backend: migrate/reset/seed if backend present ----
$dbHost = $env:E2E_DB_HOST
if ([string]::IsNullOrEmpty($dbHost)) { $dbHost = '127.0.0.1' }
$env:DATABASE_URL = "postgresql+psycopg://app:app@$dbHost:5432/app_e2e"

if ($backendDir) {
  Write-Host ""
  Write-Host "🧱 Backend setup..." -ForegroundColor Cyan
  Push-Location $backendDir

  if (Test-Path "requirements.txt") {
    Write-Host "   📦 Installing dependencies..." -ForegroundColor Gray
    python -m pip install -r requirements.txt -q
  }

  # Alembic optional
  if (Test-Path ".\alembic.ini") {
    Write-Host "   🔄 Running migrations..." -ForegroundColor Gray
    python -m alembic upgrade head
  }

  if (Test-Path ".\scripts\e2e_db_reset.py") {
    Write-Host "   🗑️  Resetting database..." -ForegroundColor Gray
    python .\scripts\e2e_db_reset.py
  }

  # Optional seed helper
  Write-Host "   🌱 Seeding test user..." -ForegroundColor Gray
  try {
    python -m app.cli_seed_dev_user "leoklemet.pa@gmail.com" "Superleo3"
  } catch {
    Write-Host "   ⚠️  Seeding skipped or failed" -ForegroundColor Yellow
  }

  Pop-Location
  Write-Host "   ✅ Backend ready" -ForegroundColor Green
}

# ---- Web: deps + typecheck + lint ----
Write-Host ""
Write-Host "🌐 Web setup..." -ForegroundColor Cyan
Push-Location $webDir

if (Test-Path "package.json") {
  Write-Host "   📦 Installing dependencies..." -ForegroundColor Gray
  pnpm i
}

if (Test-Path "package.json") {
  Write-Host "   🔍 Running typecheck..." -ForegroundColor Gray
  try {
    pnpm run typecheck
  } catch {
    Write-Host "   ❌ Typecheck failed" -ForegroundColor Red
    throw
  }
}

if (Test-Path "package.json") {
  Write-Host "   🧹 Running lint..." -ForegroundColor Gray
  try {
    pnpm run lint
  } catch {
    Write-Host "   ⚠️  Lint skipped or failed" -ForegroundColor Yellow
  }
}

# ---- Playwright: install browsers and run tests hermetically ----
Write-Host "   🎭 Installing Playwright browsers..." -ForegroundColor Gray
pnpm exec playwright install --with-deps chromium

$env:APP_ENV = "dev"
$env:ALLOW_DEV_ROUTES = "1"
$env:DEV_E2E_EMAIL = "leoklemet.pa@gmail.com"
$env:DEV_E2E_PASSWORD = "Superleo3"
$env:DEV_SUPERUSER_PIN = "946281"
$env:E2E_DB_HOST = $dbHost

Write-Host ""
Write-Host "🎭 Running Playwright tests..." -ForegroundColor Cyan
$playwrightArgs = @()
if ($Grep) {
  $playwrightArgs += @("-g", $Grep)
  Write-Host "   🔍 Filtering: $Grep" -ForegroundColor Gray
}
if ($Baseline) {
  $playwrightArgs += @("--update-snapshots")
  Write-Host "   📸 Baseline mode (updating snapshots)" -ForegroundColor Yellow
}

pnpm exec playwright test @playwrightArgs
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) {
  Write-Host ""
  Write-Host "❌ Tests failed" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "✅ All tests completed successfully!" -ForegroundColor Green
