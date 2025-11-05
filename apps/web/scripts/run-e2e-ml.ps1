#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Local E2E ML test runner with service checks.

.DESCRIPTION
    Verifies backend services are running and executes E2E ML tests.
    Provides helpful error messages if services aren't ready.

.PARAMETER SkipServiceCheck
    Skip checking if services are running (assumes they're up)

.PARAMETER Headed
    Run tests in headed mode (visible browser)

.PARAMETER Debug
    Run tests in debug mode with breakpoints

.EXAMPLE
    .\run-e2e-ml.ps1
    # Checks services and runs tests

.EXAMPLE
    .\run-e2e-ml.ps1 -Headed
    # Runs with visible browser

.EXAMPLE
    .\run-e2e-ml.ps1 -SkipServiceCheck
    # Skips service health checks
#>

param(
    [switch]$SkipServiceCheck,
    [switch]$Headed,
    [switch]$Debug,
    [string]$BaseURL = "http://localhost:8000",
    [int]$TrainLimit = 20000,
    [int]$TxnID = 999001
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "E2E ML Tests - Local Runner" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if services are running (unless skipped)
if (-not $SkipServiceCheck) {
    Write-Host "`n[1/4] Checking backend services..." -ForegroundColor Yellow
    
    # Check Docker Compose services
    $services = docker compose -f docker-compose.prod.yml ps --format json 2>$null | ConvertFrom-Json
    $backend = $services | Where-Object { $_.Service -eq "backend" -and $_.State -eq "running" }
    $postgres = $services | Where-Object { $_.Service -eq "postgres" -and $_.State -eq "running" }
    
    if (-not $backend) {
        Write-Host "❌ Backend service not running!" -ForegroundColor Red
        Write-Host "`nStart services with:" -ForegroundColor Yellow
        Write-Host "  docker compose -f docker-compose.prod.yml up -d postgres backend" -ForegroundColor White
        exit 1
    }
    
    if (-not $postgres) {
        Write-Host "❌ Postgres service not running!" -ForegroundColor Red
        Write-Host "`nStart services with:" -ForegroundColor Yellow
        Write-Host "  docker compose -f docker-compose.prod.yml up -d postgres backend" -ForegroundColor White
        exit 1
    }
    
    Write-Host "✅ Services running: backend, postgres" -ForegroundColor Green
    
    # Check backend health
    Write-Host "`n[2/4] Checking backend health..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$BaseURL/ready" -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend healthy (200 OK)" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Backend not responding at $BaseURL/ready" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nCheck backend logs with:" -ForegroundColor Yellow
        Write-Host "  docker compose -f docker-compose.prod.yml logs backend" -ForegroundColor White
        exit 1
    }
    
    # Check Playwright installation
    Write-Host "`n[3/4] Checking Playwright installation..." -ForegroundColor Yellow
    Push-Location apps/web
    try {
        $pwVersion = pnpm exec playwright --version 2>$null
        if ($pwVersion) {
            Write-Host "✅ Playwright installed: $pwVersion" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "⚠️  Playwright not installed" -ForegroundColor Yellow
        Write-Host "Installing Playwright..." -ForegroundColor Yellow
        pnpm install
        pnpm exec playwright install --with-deps chromium
        Write-Host "✅ Playwright installed" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "`n⏭️  Skipping service checks" -ForegroundColor Gray
}

# Run tests
Write-Host "`n[4/4] Running E2E ML tests..." -ForegroundColor Yellow
Write-Host "Base URL: $BaseURL" -ForegroundColor Gray
Write-Host "Train Limit: $TrainLimit" -ForegroundColor Gray
Write-Host "Transaction ID: $TxnID" -ForegroundColor Gray

Push-Location apps/web
try {
    $env:BASE_URL = $BaseURL
    $env:ML_TRAIN_LIMIT = $TrainLimit
    $env:TXN_ID = $TxnID
    
    $testArgs = @("test", "tests/e2e/ml-e2e.spec.ts", "--reporter=line")
    
    if ($Headed) {
        $testArgs += "--headed"
        Write-Host "🖥️  Running in headed mode (visible browser)" -ForegroundColor Cyan
    }
    
    if ($Debug) {
        $testArgs += "--debug"
        Write-Host "🐛 Running in debug mode" -ForegroundColor Cyan
    }
    
    Write-Host ""
    pnpm exec playwright @testArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n=====================================" -ForegroundColor Green
        Write-Host "✅ All E2E ML tests passed!" -ForegroundColor Green
        Write-Host "=====================================" -ForegroundColor Green
    }
    else {
        Write-Host "`n=====================================" -ForegroundColor Red
        Write-Host "❌ Some tests failed" -ForegroundColor Red
        Write-Host "=====================================" -ForegroundColor Red
        Write-Host "`nView full report:" -ForegroundColor Yellow
        Write-Host "  pnpm exec playwright show-report" -ForegroundColor White
        exit 1
    }
}
finally {
    Pop-Location
}
