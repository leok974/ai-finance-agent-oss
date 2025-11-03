# smoke-test-dev-unlock.ps1
# Quick local smoke test for PIN-gated dev unlock
#
# Usage:
#   .\smoke-test-dev-unlock.ps1
#
# Prerequisites:
# - Backend running on port 8989
# - Frontend running on port 5173
# - User account created with email matching DEV_SUPERUSER_EMAIL

param(
    [string]$Email = "leoklemet.pa@gmail.com",
    [string]$PIN = "946281",
    [int]$BackendPort = 8989,
    [int]$FrontendPort = 5173
)

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  PIN-Gated Dev Unlock - Smoke Test" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Set environment variables
Write-Host "[1/7] Setting environment variables..." -ForegroundColor Yellow
$env:APP_ENV = 'dev'
$env:ALLOW_DEV_ROUTES = '1'
$env:DEV_SUPERUSER_EMAIL = $Email
$env:DEV_SUPERUSER_PIN = $PIN

Write-Host "  ✓ APP_ENV=dev" -ForegroundColor Green
Write-Host "  ✓ ALLOW_DEV_ROUTES=1" -ForegroundColor Green
Write-Host "  ✓ DEV_SUPERUSER_EMAIL=$Email" -ForegroundColor Green
Write-Host "  ✓ DEV_SUPERUSER_PIN=***" -ForegroundColor Green
Write-Host ""

# Check backend is running
Write-Host "[2/7] Checking backend availability..." -ForegroundColor Yellow
try {
    $backendHealth = Invoke-WebRequest -Uri "http://localhost:$BackendPort/health" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($backendHealth.StatusCode -eq 200) {
        Write-Host "  ✓ Backend is running on port $BackendPort" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✗ Backend not accessible on port $BackendPort" -ForegroundColor Red
    Write-Host "    Start backend: cd apps/backend && python -m uvicorn app.main:app --reload --port $BackendPort" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check frontend is running
Write-Host "[3/7] Checking frontend availability..." -ForegroundColor Yellow
try {
    $frontendCheck = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($frontendCheck.StatusCode -eq 200) {
        Write-Host "  ✓ Frontend is running on port $FrontendPort" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✗ Frontend not accessible on port $FrontendPort" -ForegroundColor Red
    Write-Host "    Start frontend: cd apps/web && pnpm run dev" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check dev routes are enabled
Write-Host "[4/7] Verifying dev routes are enabled..." -ForegroundColor Yellow
try {
    $devEnv = Invoke-RestMethod -Uri "http://localhost:$BackendPort/dev/env" -Method GET -ErrorAction Stop
    if ($devEnv.allow_dev_routes -eq $true) {
        Write-Host "  ✓ Dev routes are enabled" -ForegroundColor Green
        Write-Host "    env: $($devEnv.env)" -ForegroundColor Gray
        Write-Host "    app_env: $($devEnv.app_env)" -ForegroundColor Gray
    } else {
        Write-Host "  ✗ Dev routes are disabled" -ForegroundColor Red
        Write-Host "    Set ALLOW_DEV_ROUTES=1 in backend environment" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "  ✗ Could not check dev routes" -ForegroundColor Red
    Write-Host "    Error: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check dev unlock status (before unlock)
Write-Host "[5/7] Checking dev unlock status (before unlock)..." -ForegroundColor Yellow
Write-Host "  Note: This check requires authentication. Use browser to test full flow." -ForegroundColor Gray
Write-Host ""

# Manual steps for UI testing
Write-Host "[6/7] Manual UI Testing Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Open browser: http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host "  2. Login with: $Email" -ForegroundColor Cyan
Write-Host "  3. Click 'Account' dropdown menu" -ForegroundColor Cyan
Write-Host "  4. Click 'Unlock Dev Tools' button" -ForegroundColor Cyan
Write-Host "  5. Enter PIN: $PIN" -ForegroundColor Cyan
Write-Host "  6. Click 'Unlock' button" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Expected Results:" -ForegroundColor Green
Write-Host "    ✓ Toast message: 'Dev mode unlocked'" -ForegroundColor Green
Write-Host "    ✓ RAG chips visible in chat dock" -ForegroundColor Green
Write-Host "    ✓ Seed button clickable" -ForegroundColor Green
Write-Host "    ✓ Account menu shows 'Dev Tools Unlocked ✓'" -ForegroundColor Green
Write-Host ""

# Persistence test
Write-Host "[7/7] Testing Persistence:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  After unlocking in the UI:" -ForegroundColor Cyan
Write-Host "  1. Refresh the page (F5)" -ForegroundColor Cyan
Write-Host "  2. Verify RAG chips STILL visible (no re-login needed)" -ForegroundColor Cyan
Write-Host "  3. Close and reopen browser" -ForegroundColor Cyan
Write-Host "  4. Verify RAG chips STILL visible (session persists)" -ForegroundColor Cyan
Write-Host "  5. Click Seed button and verify it works" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Expected:" -ForegroundColor Green
Write-Host "    ✓ Unlock persists across page refreshes" -ForegroundColor Green
Write-Host "    ✓ Unlock persists until logout or 8 hours" -ForegroundColor Green
Write-Host "    ✓ Cookie 'dev_unlocked=1' visible in browser DevTools" -ForegroundColor Green
Write-Host ""

# Security test
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Security Test: Production Guard" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test production security:" -ForegroundColor Yellow
Write-Host "  1. Stop backend and frontend" -ForegroundColor Cyan
Write-Host "  2. Set: `$env:APP_ENV='prod'" -ForegroundColor Cyan
Write-Host "  3. Restart backend" -ForegroundColor Cyan
Write-Host "  4. Open UI and login" -ForegroundColor Cyan
Write-Host "  5. Verify 'Unlock Dev Tools' button does NOT appear" -ForegroundColor Cyan
Write-Host "  6. Verify RAG chips do NOT appear (even if cookie exists)" -ForegroundColor Cyan
Write-Host ""

# API test examples
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  API Test Examples (requires auth token)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "# Get dev status" -ForegroundColor Gray
Write-Host "curl -X GET http://localhost:$BackendPort/auth/dev/status \" -ForegroundColor White
Write-Host "     -H 'Cookie: access_token=YOUR_TOKEN'" -ForegroundColor White
Write-Host ""
Write-Host "# Unlock with PIN" -ForegroundColor Gray
Write-Host "curl -X POST http://localhost:$BackendPort/auth/dev/unlock \" -ForegroundColor White
Write-Host "     -H 'Cookie: access_token=YOUR_TOKEN' \" -ForegroundColor White
Write-Host "     -F 'pin=$PIN'" -ForegroundColor White
Write-Host ""
Write-Host "# Lock dev mode" -ForegroundColor Gray
Write-Host "curl -X POST http://localhost:$BackendPort/auth/dev/lock \" -ForegroundColor White
Write-Host "     -H 'Cookie: access_token=YOUR_TOKEN'" -ForegroundColor White
Write-Host ""

# Summary
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment configured:" -ForegroundColor Green
Write-Host "  APP_ENV = $env:APP_ENV" -ForegroundColor White
Write-Host "  ALLOW_DEV_ROUTES = $env:ALLOW_DEV_ROUTES" -ForegroundColor White
Write-Host "  DEV_SUPERUSER_EMAIL = $Email" -ForegroundColor White
Write-Host "  DEV_SUPERUSER_PIN = ***" -ForegroundColor White
Write-Host ""
Write-Host "Backend: http://localhost:$BackendPort" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ready for manual testing! Follow steps above." -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
