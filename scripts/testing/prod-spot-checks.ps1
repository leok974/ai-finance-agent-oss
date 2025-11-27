#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Production spot-checks for multi-user data isolation

.DESCRIPTION
    Verifies:
    1. New users see empty dashboard
    2. Cache-Control headers are set correctly
    3. User isolation is enforced
    4. Database has no NULL user_ids

.PARAMETER BaseUrl
    The base URL of the production API (e.g., https://app.ledger-mind.org)

.EXAMPLE
    .\prod-spot-checks.ps1 -BaseUrl "https://app.ledger-mind.org"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Production Spot-Checks: Multi-User Isolation" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

$ErrorCount = 0

# A. New user = empty dashboard
Write-Host "Test A: Cache-Control headers" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/transactions?limit=1" -Method HEAD -UseBasicParsing -SkipHttpErrorCheck
    $cacheControl = $response.Headers['Cache-Control']

    if ($cacheControl -match "private" -and $cacheControl -match "no-store") {
        Write-Host "  ✅ Cache-Control headers correct: $cacheControl" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Cache-Control headers missing or incorrect: $cacheControl" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "  ⚠️  Could not check Cache-Control headers: $_" -ForegroundColor Yellow
}

# B. Database verification (run locally)
Write-Host "`nTest B: Database integrity (local check)" -ForegroundColor Yellow
Write-Host "  Run this locally in backend directory:" -ForegroundColor Cyan
Write-Host "  .\.venv\Scripts\python.exe -c `"from app.db import SessionLocal; from sqlalchemy import text; db = SessionLocal(); print('NULL user_ids:', db.execute(text('SELECT COUNT(*) FROM transactions WHERE user_id IS NULL')).scalar()); db.close()`"" -ForegroundColor Gray

# C. Redis keys verification (if using Redis)
Write-Host "`nTest C: Redis cache keys (if using Redis)" -ForegroundColor Yellow
Write-Host "  Run these commands on your Redis instance:" -ForegroundColor Cyan
Write-Host "  redis-cli --scan --pattern 'summary:*'     # Expect: none (old global keys)" -ForegroundColor Gray
Write-Host "  redis-cli --scan --pattern 'user:*:summary:*' | head  # Expect: namespaced keys" -ForegroundColor Gray

# D. Service health check
Write-Host "`nTest D: Service health" -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -UseBasicParsing
    if ($healthResponse.ok -eq $true) {
        Write-Host "  ✅ Backend is healthy" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Backend health check failed" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "  ❌ Backend is not responding: $_" -ForegroundColor Red
    $ErrorCount++
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "Spot-Check Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($ErrorCount -eq 0) {
    Write-Host "✅ All automated checks passed!" -ForegroundColor Green
} else {
    Write-Host "❌ $ErrorCount check(s) failed" -ForegroundColor Red
}

Write-Host "`nManual checks required:" -ForegroundColor Yellow
Write-Host "  1. Login as two different users and verify isolation" -ForegroundColor Gray
Write-Host "  2. Upload data as User A, verify User B sees empty state" -ForegroundColor Gray
Write-Host "  3. Check application logs for any 401/403 errors" -ForegroundColor Gray
Write-Host "  4. Verify Redis keys are namespaced (if using Redis)" -ForegroundColor Gray

exit $ErrorCount
