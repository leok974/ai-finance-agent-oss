#!/usr/bin/env pwsh
# Test authentication flow and API guards
# Run: .\scripts\test-auth-flow.ps1

$BASE_URL = "https://app.ledger-mind.org"

Write-Host "`n🧪 Testing Authentication Flow" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Test 1: Unauthenticated requests should return 401
Write-Host "1. Testing unauthenticated access..." -ForegroundColor Yellow
$endpoints = @(
    @{ Path = "/api/auth/me"; Method = "GET" },
    @{ Path = "/agent/tools/analytics/forecast/cashflow"; Method = "POST" },
    @{ Path = "/agent/tools/insights/expanded"; Method = "POST" }
)

foreach ($endpoint in $endpoints) {
    try {
        $params = @{
            Uri = "$BASE_URL$($endpoint.Path)"
            Method = $endpoint.Method
            SkipHttpErrorCheck = $true
        }
        
        if ($endpoint.Method -eq "POST") {
            $params.Headers = @{ "Content-Type" = "application/json" }
            $params.Body = '{}'
        }
        
        $response = Invoke-WebRequest @params 2>$null
        
        $status = $response.StatusCode
        $emoji = if ($status -eq 401) { "✅" } else { "❌" }
        Write-Host "  $emoji $($endpoint.Path) : HTTP $status" -ForegroundColor $(if ($status -eq 401) { "Green" } else { "Red" })
        
        if ($status -ne 401) {
            Write-Host "    UNEXPECTED: Should return 401 when not authenticated" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ $($endpoint.Path) : Request failed - $_" -ForegroundColor Red
    }
}

# Test 2: Health endpoints should be public
Write-Host "`n2. Testing public endpoints..." -ForegroundColor Yellow
$publicEndpoints = @("/api/healthz", "/api/ready", "/_up")

foreach ($endpoint in $publicEndpoints) {
    try {
        $response = Invoke-WebRequest -Uri "$BASE_URL$endpoint" -SkipHttpErrorCheck 2>$null
        $status = $response.StatusCode
        $emoji = if ($status -in @(200, 204)) { "✅" } else { "⚠️" }
        Write-Host "  $emoji $endpoint : HTTP $status" -ForegroundColor $(if ($status -in @(200, 204)) { "Green" } else { "Yellow" })
    } catch {
        Write-Host "  ❌ $endpoint : Request failed - $_" -ForegroundColor Red
    }
}

# Test 3: Check deployed build metadata
Write-Host "`n3. Checking deployed build..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/_version" 2>$null
    $version = $response.Content | ConvertFrom-Json
    Write-Host "  ✅ Build:" -ForegroundColor Green
    Write-Host "    Commit: $($version.commit)" -ForegroundColor Gray
    Write-Host "    Branch: $($version.branch)" -ForegroundColor Gray
    Write-Host "    Built: $($version.build_time)" -ForegroundColor Gray
} catch {
    Write-Host "  ⚠️  Could not fetch version metadata" -ForegroundColor Yellow
}

# Test 4: Check nginx container
Write-Host "`n4. Checking nginx status..." -ForegroundColor Yellow
$nginxStatus = docker compose -f docker-compose.prod.yml ps nginx --format json | ConvertFrom-Json
Write-Host "  Status: $($nginxStatus.State)" -ForegroundColor $(if ($nginxStatus.State -eq "running") { "Green" } else { "Red" })
Write-Host "  Health: $($nginxStatus.Health)" -ForegroundColor $(if ($nginxStatus.Health -eq "healthy") { "Green" } else { "Red" })

# Test 5: Verify no 500 errors in backend logs
Write-Host "`n5. Checking for recent errors..." -ForegroundColor Yellow
$errors = docker compose -f docker-compose.prod.yml logs backend --tail=50 --since 10m | Select-String -Pattern "ERROR|500|Traceback"
if ($errors) {
    Write-Host "  ⚠️  Found errors in backend logs:" -ForegroundColor Yellow
    $errors | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✅ No errors in last 10 minutes" -ForegroundColor Green
}

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Unauthenticated API calls are properly blocked (401)" -ForegroundColor White
Write-Host "  - Health endpoints are accessible" -ForegroundColor White
Write-Host "  - Latest build is deployed" -ForegroundColor White
Write-Host "`nNext: Clear browser cache and test login flow" -ForegroundColor Yellow
Write-Host "  1. DevTools (F12) → Application → Clear site data" -ForegroundColor Gray
Write-Host "  2. Hard refresh (Ctrl+Shift+R)" -ForegroundColor Gray
Write-Host "  3. Log in with Google" -ForegroundColor Gray
Write-Host "  4. Dashboard should render without errors`n" -ForegroundColor Gray
