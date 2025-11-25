# Quick Verification Script for Reset Fix
# Run this to verify the deployment is working correctly

Write-Host "=== LedgerMind Reset Fix Verification ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check backend container
Write-Host "[1/4] Checking backend container..." -ForegroundColor Yellow
$backend = docker ps --filter "name=ai-finance-backend" --format "{{.Image}}"
if ($backend -eq "ledgermind-backend:main-reset-clean") {
    Write-Host "  ✅ Backend running: $backend" -ForegroundColor Green
} else {
    Write-Host "  ❌ Backend NOT using main-reset-clean: $backend" -ForegroundColor Red
}

# 2. Check frontend container
Write-Host "[2/4] Checking frontend container..." -ForegroundColor Yellow
$frontend = docker ps --filter "name=nginx" --format "{{.Names}}`t{{.Image}}" | Select-String "ai-finance"
if ($frontend) {
    Write-Host "  ✅ Frontend running: $frontend" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Frontend container name might be different" -ForegroundColor Yellow
}

# 3. Check database transaction counts
Write-Host "[3/4] Checking database transaction counts..." -ForegroundColor Yellow
$counts = docker exec lm-postgres psql -U lm -d lm -t -c "SELECT user_id, email, COUNT(*) as txn_count FROM transactions JOIN users ON transactions.user_id = users.id GROUP BY user_id, email ORDER BY user_id;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Transaction counts by user:" -ForegroundColor Gray
    $counts | ForEach-Object {
        $line = $_.ToString().Trim()
        if ($line -and $line -notlike "*psql*" -and $line -notlike "*ERROR*") {
            Write-Host "    $line" -ForegroundColor White
        }
    }
} else {
    Write-Host "  ❌ Failed to query database" -ForegroundColor Red
}

# 4. Check backend health
Write-Host "[4/4] Checking backend health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8083/api/ready" -UseBasicParsing -TimeoutSec 5
    if ($health.StatusCode -eq 200) {
        Write-Host "  ✅ Backend health check passed (HTTP $($health.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Backend responded with HTTP $($health.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Backend health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Manual Testing Instructions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open browser to: https://app.ledger-mind.org" -ForegroundColor White
Write-Host "2. Sign in with Google" -ForegroundColor White
Write-Host "3. Click 'Use sample data' button" -ForegroundColor White
Write-Host "4. Verify you see transactions (should be ~\$1808 total)" -ForegroundColor White
Write-Host "5. Click 'Reset Dashboard' and confirm" -ForegroundColor White
Write-Host "6. EXPECTED: All charts show \$0.00 and 'No data' messages" -ForegroundColor Green
Write-Host "7. EXPECTED: Network tab shows POST /ingest/dashboard/reset → 200 OK" -ForegroundColor Green
Write-Host "8. EXPECTED: Response body: {""ok"": true, ""deleted"": 72}" -ForegroundColor Green
Write-Host ""
Write-Host "If you see \$1808.89 after reset, that means:" -ForegroundColor Red
Write-Host "  - Chart endpoints may still be using old image" -ForegroundColor Red
Write-Host "  - Or there's a caching issue (hard refresh: Ctrl+Shift+R)" -ForegroundColor Red
Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Cyan
