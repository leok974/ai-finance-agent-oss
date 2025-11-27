#!/usr/bin/env pwsh
# Production Site Verification Script
# Tests the deployed defensive measures without requiring authentication

param(
    [string]$BaseUrl = "https://app.ledger-mind.org"
)

Write-Host "`n🛡️  DEFENSIVE MEASURES VERIFICATION" -ForegroundColor Cyan
Write-Host "===================================`n" -ForegroundColor Cyan

$ErrorCount = 0
$WarningCount = 0

# Test 1: Frontend loads
Write-Host "1. Frontend Accessibility..." -ForegroundColor Yellow
try {
    $response = curl -s -I "$BaseUrl" 2>&1 | Out-String
    if ($response -match "HTTP/[12]\.\d\s+200") {
        Write-Host "   ✅ Frontend accessible (HTTP 200)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Frontend not accessible" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ❌ Frontend check failed: $_" -ForegroundColor Red
    $ErrorCount++
}

# Test 2: Backend health
Write-Host "`n2. Backend Health..." -ForegroundColor Yellow
try {
    $health = curl -s "$BaseUrl/api/healthz" | ConvertFrom-Json
    if ($health.db.reachable) {
        Write-Host "   ✅ Database reachable" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Database not reachable" -ForegroundColor Yellow
        $WarningCount++
    }
    
    if ($health.status -eq "degraded") {
        Write-Host "   ⚠️  Backend health: $($health.status)" -ForegroundColor Yellow
        Write-Host "      Reasons: $($health.reasons -join ', ')" -ForegroundColor Gray
        $WarningCount++
    }
} catch {
    Write-Host "   ❌ Health check failed: $_" -ForegroundColor Red
    $ErrorCount++
}

# Test 3: Auth guards working (should return 401, not 500)
Write-Host "`n3. Auth Guard Endpoints..." -ForegroundColor Yellow

$authEndpoints = @(
    "/agent/tools/analytics/forecast/cashflow",
    "/agent/tools/insights/expanded",
    "/agent/tools/charts/summary"
)

foreach ($endpoint in $authEndpoints) {
    try {
        $response = curl -s -X POST "$BaseUrl$endpoint" `
            -H "Content-Type: application/json" `
            -d '{}' `
            -w "%{http_code}" `
            -o $null 2>&1
        
        if ($response -eq "401") {
            Write-Host "   ✅ $endpoint : HTTP 401 (auth required)" -ForegroundColor Green
        } elseif ($response -eq "500") {
            Write-Host "   ❌ $endpoint : HTTP 500 (STILL BROKEN!)" -ForegroundColor Red
            $ErrorCount++
        } else {
            Write-Host "   ⚠️  $endpoint : HTTP $response (unexpected)" -ForegroundColor Yellow
            $WarningCount++
        }
    } catch {
        Write-Host "   ❌ $endpoint : Failed - $_" -ForegroundColor Red
        $ErrorCount++
    }
}

# Test 4: Public endpoints accessible
Write-Host "`n4. Public Endpoints..." -ForegroundColor Yellow

$publicEndpoints = @(
    @{ Path = "/api/healthz"; Method = "GET" },
    @{ Path = "/api/ready"; Method = "GET" },
    @{ Path = "/_up"; Method = "GET" }
)

foreach ($endpoint in $publicEndpoints) {
    try {
        $response = curl -s -X $endpoint.Method "$BaseUrl$($endpoint.Path)" `
            -w "%{http_code}" `
            -o $null 2>&1
        
        if ($response -match "^(200|204)$") {
            Write-Host "   ✅ $($endpoint.Path) : HTTP $response" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  $($endpoint.Path) : HTTP $response" -ForegroundColor Yellow
            $WarningCount++
        }
    } catch {
        Write-Host "   ❌ $($endpoint.Path) : Failed - $_" -ForegroundColor Red
        $ErrorCount++
    }
}

# Test 5: Check deployed build version
Write-Host "`n5. Deployed Build Version..." -ForegroundColor Yellow
try {
    $buildInfo = curl -s "$BaseUrl/build.json" 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($buildInfo) {
        Write-Host "   ✅ Build Info:" -ForegroundColor Green
        Write-Host "      Commit: $($buildInfo.commit)" -ForegroundColor Gray
        Write-Host "      Branch: $($buildInfo.branch)" -ForegroundColor Gray
        Write-Host "      Built: $($buildInfo.built_at)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Build info not available" -ForegroundColor Yellow
        $WarningCount++
    }
} catch {
    Write-Host "   ⚠️  Could not fetch build info" -ForegroundColor Yellow
    $WarningCount++
}

# Test 6: Check for recent backend errors
Write-Host "`n6. Recent Backend Errors..." -ForegroundColor Yellow
try {
    $logs = docker compose -f docker-compose.prod.yml logs backend --tail=50 --since=10m 2>&1 | Out-String
    $errors = $logs | Select-String -Pattern "ERROR|500|Traceback" -AllMatches
    
    if ($errors.Matches.Count -eq 0) {
        Write-Host "   ✅ No errors in last 10 minutes" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Found $($errors.Matches.Count) error(s) in logs" -ForegroundColor Yellow
        $WarningCount++
    }
} catch {
    Write-Host "   ⚠️  Could not check logs: $_" -ForegroundColor Yellow
    $WarningCount++
}

# Summary
Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host "VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

if ($ErrorCount -eq 0 -and $WarningCount -eq 0) {
    Write-Host "✅ ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "`nDeployment is healthy. Defensive measures are active." -ForegroundColor Green
} elseif ($ErrorCount -eq 0) {
    Write-Host "⚠️  PASSED WITH $WarningCount WARNING(S)" -ForegroundColor Yellow
    Write-Host "`nDeployment is functional but has some warnings (likely pre-existing)." -ForegroundColor Yellow
} else {
    Write-Host "❌ FAILED WITH $ErrorCount ERROR(S) AND $WarningCount WARNING(S)" -ForegroundColor Red
    Write-Host "`nDeployment has critical issues that need attention." -ForegroundColor Red
}

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS FOR USER TESTING:" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "1. Close ALL browser windows" -ForegroundColor White
Write-Host "2. Run: Remove-Item -Recurse -Force 'C:\tmp\prod-profile'" -ForegroundColor White
Write-Host "3. Open fresh incognito window (Ctrl+Shift+N)" -ForegroundColor White
Write-Host "4. Visit: $BaseUrl" -ForegroundColor White
Write-Host "5. Open DevTools (F12) → Application → Clear site data" -ForegroundColor White
Write-Host "6. Hard refresh (Ctrl+Shift+F5)" -ForegroundColor White
Write-Host "7. Test login and dashboard load`n" -ForegroundColor White

exit $ErrorCount
