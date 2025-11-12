# OAuth Regression Test Script
# Quick smoke test for OAuth endpoints
# Usage:
#   Local: .\scripts\auth\regress.ps1
#   Prod:  .\scripts\auth\regress.ps1 -Base "https://app.ledger-mind.org"

param(
    [string]$Base = "http://127.0.0.1:8000"
)

Write-Host "`n=== OAuth Regression Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $Base`n" -ForegroundColor Yellow

# Test 1: Health check
Write-Host "[1/4] Health check..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod "$Base/health" -ErrorAction Stop
    if ($health.ok) {
        Write-Host "  ✓ Health OK" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Health not OK: $health" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: /auth/me without cookie (should return 401)
Write-Host "`n[2/4] /auth/me without session (expect 401)..." -ForegroundColor Cyan
try {
    $me = Invoke-RestMethod "$Base/auth/me" -ErrorAction Stop
    Write-Host "  ✗ Unexpected success (should be 401): $me" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "  ✓ Correctly returns 401 (No session)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Wrong status code: $statusCode (expected 401)" -ForegroundColor Red
    }
}

# Test 3: /auth/google/login redirects to Google
Write-Host "`n[3/4] /auth/google/login redirect check..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest "$Base/auth/google/login" -MaximumRedirection 0 -ErrorAction SilentlyContinue
    $location = $response.Headers.Location
    if ($location -and $location -match "accounts\.google\.com") {
        Write-Host "  ✓ Redirects to Google OAuth" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Unexpected redirect: $location" -ForegroundColor Red
    }
} catch {
    # PowerShell throws on 302, check if it's a redirect
    if ($_.Exception.Response.StatusCode -eq 302 -or $_.Exception.Response.StatusCode -eq 307) {
        $location = $_.Exception.Response.Headers.Location
        if ($location -match "accounts\.google\.com") {
            Write-Host "  ✓ Redirects to Google OAuth (302/307)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Redirects but not to Google: $location" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 4: Display login URL for manual testing
Write-Host "`n[4/4] Manual login URL:" -ForegroundColor Cyan
Write-Host "  $Base/auth/google/login" -ForegroundColor Green
Write-Host "`n  To test full flow:" -ForegroundColor Yellow
Write-Host "    1. Open the URL above in a browser" -ForegroundColor Gray
Write-Host "    2. Complete Google sign-in" -ForegroundColor Gray
Write-Host "    3. Run: Invoke-RestMethod '$Base/auth/me'" -ForegroundColor Gray

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
