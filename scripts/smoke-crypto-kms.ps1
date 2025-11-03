#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Smoke test to verify KMS mode is active and healthy
.DESCRIPTION
    Checks that the backend is running in KMS mode with crypto ready.
    Returns exit code 0 on success, 1 on failure.
    Suitable for CI/CD pipelines and monitoring.
.PARAMETER BaseUrl
    Base URL of the backend API (default: http://localhost:8000)
.EXAMPLE
    .\smoke-crypto-kms.ps1
    .\smoke-crypto-kms.ps1 -BaseUrl "https://api.ledger-mind.org"
#>

param(
    [string]$BaseUrl = "http://localhost:8000"
)

Write-Host "`n🔍 KMS Crypto Smoke Test" -ForegroundColor Cyan
Write-Host "Testing: $BaseUrl" -ForegroundColor Gray

try {
    # Test /healthz endpoint
    $health = Invoke-RestMethod "$BaseUrl/healthz" -TimeoutSec 10

    Write-Host "`n📊 Results:" -ForegroundColor Yellow
    Write-Host "  crypto_mode:  $($health.crypto_mode)" -ForegroundColor $(if($health.crypto_mode -eq 'kms'){'Green'}else{'Red'})
    Write-Host "  crypto_ready: $($health.crypto_ready)" -ForegroundColor $(if($health.crypto_ready){'Green'}else{'Red'})
    Write-Host "  status:       $($health.status)" -ForegroundColor $(if($health.status -eq 'ok'){'Green'}else{'Red'})

    # Check KMS mode
    if ($health.crypto_mode -ne 'kms') {
        Write-Host "`n❌ FAIL: Crypto mode is '$($health.crypto_mode)', expected 'kms'" -ForegroundColor Red
        exit 1
    }

    # Check crypto ready
    if (-not $health.crypto_ready) {
        Write-Host "`n❌ FAIL: Crypto is not ready" -ForegroundColor Red
        exit 1
    }

    # Check overall status
    if ($health.status -ne 'ok') {
        Write-Host "`n❌ FAIL: Health status is '$($health.status)', expected 'ok'" -ForegroundColor Red
        exit 1
    }

    Write-Host "`n✅ PASS: KMS mode active and healthy" -ForegroundColor Green
    exit 0

} catch {
    Write-Host "`n❌ FAIL: Error connecting to $BaseUrl" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
