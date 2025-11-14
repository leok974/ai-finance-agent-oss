#!/usr/bin/env pwsh
<#
.SYNOPSIS
    LedgerMind production health check script

.DESCRIPTION
    Validates both internal (Docker network) and external (Cloudflare tunnel) connectivity
    for the LedgerMind application stack.

.PARAMETER BaseUrl
    Base URL for the LedgerMind web application (default: https://app.ledger-mind.org)

.PARAMETER ApiBase
    Base URL for the direct API endpoint (default: https://api.ledger-mind.org)

.EXAMPLE
    .\lm-health.ps1

.EXAMPLE
    .\lm-health.ps1 -BaseUrl "http://127.0.0.1:8083" -ApiBase "http://127.0.0.1:8083"

.NOTES
    Run this script after any changes to:
    - docker-compose.prod.yml (network aliases)
    - Cloudflare tunnel routes (dashboard config)
    - deploy/nginx.conf (redirects or proxy rules)
#>

param(
  [string]$BaseUrl = "https://app.ledger-mind.org",
  [string]$ApiBase = "https://api.ledger-mind.org"
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "LedgerMind Health Check" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Internal (infra_net) checks
Write-Host "== Internal (infra_net) checks ==" -ForegroundColor Cyan
Write-Host "Testing connectivity from within Docker network...`n" -ForegroundColor Gray

try {
    $internalCheck = docker run --rm --network infra_net curlimages/curl:latest sh -c `
      "echo 'nginx:'; curl -sI http://ledgermind-web.int:80/ 2>&1 | head -5; echo; echo 'backend /ready:'; curl -s http://ledgermind-api.int:8000/ready 2>&1"

    Write-Host $internalCheck -ForegroundColor White

    if ($internalCheck -match "HTTP.*200" -or $internalCheck -match '"ok"') {
        Write-Host "✅ Internal connectivity OK`n" -ForegroundColor Green
    } else {
        Write-Host "❌ Internal connectivity FAILED`n" -ForegroundColor Red
        Write-Host "TROUBLESHOOTING:" -ForegroundColor Yellow
        Write-Host "  1. Check that nginx and backend are on infra_net:" -ForegroundColor Yellow
        Write-Host "     docker inspect ai-finance-agent-oss-clean-nginx-1 --format '{{range .NetworkSettings.Networks}}{{.}}{{end}}'" -ForegroundColor Gray
        Write-Host "  2. Check network aliases:" -ForegroundColor Yellow
        Write-Host "     docker inspect ai-finance-agent-oss-clean-nginx-1 --format '{{range .NetworkSettings.Networks}}{{.Aliases}}{{end}}'" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Internal curl failed: $_`n" -ForegroundColor Red
}

# External (Cloudflare) checks
Write-Host "== External (Cloudflare) checks ==" -ForegroundColor Cyan
Write-Host "Testing public endpoints via Cloudflare tunnel...`n" -ForegroundColor Gray

Write-Host "Frontend (/):" -ForegroundColor Yellow
try {
    $frontendResult = curl -I $BaseUrl 2>&1 | Select-String "HTTP|cf-ray|Server"
    Write-Host $frontendResult -ForegroundColor White

    if ($frontendResult -match "HTTP.*200") {
        Write-Host "✅ Frontend OK`n" -ForegroundColor Green
    } else {
        Write-Host "❌ Frontend FAILED`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Frontend check failed: $_`n" -ForegroundColor Red
}

Write-Host "API direct (/ready):" -ForegroundColor Yellow
try {
    $apiReadyResult = curl -s "$ApiBase/ready" 2>&1
    Write-Host $apiReadyResult -ForegroundColor White

    if ($apiReadyResult -match '"ok"') {
        Write-Host "✅ API direct OK`n" -ForegroundColor Green
    } else {
        Write-Host "❌ API direct FAILED`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ API direct check failed: $_`n" -ForegroundColor Red
}

Write-Host "API via app domain (/api/auth/me):" -ForegroundColor Yellow
try {
    $apiProxyResult = curl -s "$BaseUrl/api/auth/me" 2>&1
    Write-Host $apiProxyResult -ForegroundColor White

    if ($apiProxyResult -match "Missing credentials" -or $apiProxyResult -match "401") {
        Write-Host "✅ API proxy OK (401 Unauthorized = correct, no credentials provided)`n" -ForegroundColor Green
    } elseif ($apiProxyResult -match "502") {
        Write-Host "❌ API proxy FAILED (502 Bad Gateway)`n" -ForegroundColor Red
        Write-Host "TROUBLESHOOTING:" -ForegroundColor Yellow
        Write-Host "  1. Check tunnel logs:" -ForegroundColor Yellow
        Write-Host "     docker logs --tail 40 cfd-a | Select-String 'ledger-mind|nginx|backend|error'" -ForegroundColor Gray
        Write-Host "  2. Verify Cloudflare dashboard routes:" -ForegroundColor Yellow
        Write-Host "     app.ledger-mind.org -> http://ledgermind-web.int:80" -ForegroundColor Gray
        Write-Host "     api.ledger-mind.org -> http://ledgermind-api.int:8000" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  API proxy returned unexpected response`n" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ API proxy check failed: $_`n" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Health Check Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Expected results:" -ForegroundColor Gray
Write-Host "  ✅ Internal nginx:       HTTP 200 OK" -ForegroundColor Gray
Write-Host "  ✅ Internal backend:     {`"ok`":false,...} (JSON response)" -ForegroundColor Gray
Write-Host "  ✅ External frontend:    HTTP 200 OK" -ForegroundColor Gray
Write-Host "  ✅ External API direct:  {`"ok`":false,...}" -ForegroundColor Gray
Write-Host "  ✅ External API proxy:   {`"detail`":`"Missing credentials`"} (401)" -ForegroundColor Gray
Write-Host ""

Write-Host "If all checks pass, your stack is healthy! 🎉" -ForegroundColor Green
Write-Host "If any checks fail, see troubleshooting steps above.`n" -ForegroundColor Yellow
