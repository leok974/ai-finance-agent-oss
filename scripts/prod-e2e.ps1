# Production E2E Testing - Quick Start Script
# This script guides you through capturing production auth state and running tests

Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  LedgerMind Production E2E Testing Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$webDir = "apps\web"
$stateFile = "$webDir\tests\e2e\.auth\prod-state.json"
$captureScript = "$webDir\tests\e2e\.auth\capture-prod-state.ts"

# Check if we're in the right directory
if (-not (Test-Path $webDir)) {
    Write-Host "❌ Error: Must run from repository root" -ForegroundColor Red
    Write-Host "   Current location: $PWD" -ForegroundColor Yellow
    Write-Host "   Expected: ai-finance-agent-oss-clean/" -ForegroundColor Yellow
    exit 1
}

# Check if state already exists
$hasState = Test-Path $stateFile
if ($hasState) {
    Write-Host "✅ Production state found: $stateFile" -ForegroundColor Green
    Write-Host ""
    $recapture = Read-Host "Do you want to re-capture (update) the state? (y/N)"
    if ($recapture -ne "y" -and $recapture -ne "Y") {
        Write-Host "Skipping capture. Using existing state." -ForegroundColor Yellow
        $skipCapture = $true
    } else {
        $skipCapture = $false
    }
} else {
    Write-Host "ℹ️  No production state found. Will capture now." -ForegroundColor Yellow
    $skipCapture = $false
}

Write-Host ""

# Step 1: Capture state (if needed)
if (-not $skipCapture) {
    Write-Host "────────────────────────────────────────────────────" -ForegroundColor Cyan
    Write-Host "  STEP 1: Capture Production Authentication" -ForegroundColor Cyan
    Write-Host "────────────────────────────────────────────────────" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Yellow
    Write-Host "  1. A Chrome browser will open to https://app.ledger-mind.org" -ForegroundColor White
    Write-Host "  2. If not logged in, click 'Sign in with Google'" -ForegroundColor White
    Write-Host "  3. Complete the OAuth flow manually" -ForegroundColor White
    Write-Host "  4. Once the dashboard loads, press ENTER in THIS terminal" -ForegroundColor White
    Write-Host ""

    $ready = Read-Host "Press ENTER to start browser capture, or Ctrl+C to cancel"

    Set-Location $webDir
    $env:BASE_URL = "https://app.ledger-mind.org"

    Write-Host ""
    Write-Host "🚀 Launching browser..." -ForegroundColor Cyan
    pnpm exec tsx tests\e2e\.auth\capture-prod-state.ts

    if (-not $?) {
        Write-Host ""
        Write-Host "❌ Capture failed!" -ForegroundColor Red
        Set-Location ..\..
        exit 1
    }

    Set-Location ..\..
    Write-Host ""
    Write-Host "✅ State captured successfully!" -ForegroundColor Green
}

# Step 2: Run tests
Write-Host ""
Write-Host "────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  STEP 2: Run Production Tests" -ForegroundColor Cyan
Write-Host "────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "Available test suites:" -ForegroundColor Yellow
Write-Host "  1. Smoke tests only (read-only, safe)" -ForegroundColor White
Write-Host "  2. Upload tests (user-scoped mutations)" -ForegroundColor White
Write-Host "  3. All production-safe tests" -ForegroundColor White
Write-Host "  4. Skip testing (just capture state)" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Select option (1-4)"

Set-Location $webDir
$env:BASE_URL = "https://app.ledger-mind.org"
$env:PW_SKIP_WS = "1"

Write-Host ""

switch ($choice) {
    "1" {
        Write-Host "🧪 Running smoke tests..." -ForegroundColor Cyan
        pnpm exec playwright test tests\e2e\prod-smoke.spec.ts --project=chromium-prod --reporter=line
    }
    "2" {
        Write-Host "🧪 Running upload tests..." -ForegroundColor Cyan
        pnpm exec playwright test tests\e2e\prod-upload.spec.ts --project=chromium-prod --reporter=line
    }
    "3" {
        Write-Host "🧪 Running all production tests..." -ForegroundColor Cyan
        pnpm exec playwright test --project=chromium-prod --reporter=line
    }
    "4" {
        Write-Host "✅ State captured. Skipping tests." -ForegroundColor Yellow
        Set-Location ..\..
        exit 0
    }
    default {
        Write-Host "❌ Invalid choice. Exiting." -ForegroundColor Red
        Set-Location ..\..
        exit 1
    }
}

Set-Location ..\..

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ All tests passed!" -ForegroundColor Green
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
} else {
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host "  ❌ Some tests failed. Check output above." -ForegroundColor Red
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Red
}

Write-Host ""
Write-Host "📚 For more info, see: apps/web/tests/e2e/PROD-TESTING.md" -ForegroundColor Cyan
Write-Host ""
